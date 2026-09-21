-- 015_org_passcodes.sql — MT-3: per-org passcodes, the tenant-identity bridge
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app). Requires 007-014.
-- Plan: MULTI-TENANT-PLAN.md §3.2, phase MT-3 step 1.
--
-- Numbered 015, not the §6.1-reserved 014: 014_scope_lineup_plans_key.sql took
-- that number for an MT-2 fix and said so in its own header. Forward-only
-- numbering doing its job.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS BUYS
-- ---------------------------------------------------------------------------
-- Today's gate (src/lib/coach/auth.ts) proves "someone knows THE passcode".
-- Under multi-tenancy that is not a statement about which data they may see
-- (§3.1). This table turns the login from a COMPARE into a LOOKUP: hash the
-- submitted passcode, find the row, and the row names the org. Tenant identity
-- without building user accounts — which is MT-5's job, deliberately deferred
-- (§3.3, §9.3).
--
-- ---------------------------------------------------------------------------
-- ⚠️ ENFORCEMENT: STAGE A ONLY. §3.4 STAGE B IS NOT IN THIS PHASE.
-- ---------------------------------------------------------------------------
-- §3.4 Stage B (mint a per-request JWT signed with the project's SYMMETRIC JWT
-- secret, connect on the anon key, let 013's policies bite) is NOT viable on
-- this project. Checked 2026-09-21 against the Management API's signing-keys
-- endpoint: the ACTIVE signing key is ES256 (asymmetric); the HS256 symmetric
-- key is status "previously_used". There is no symmetric secret to sign with.
--
-- §9.1 wrote this contingency in advance and names the outcome exactly:
-- "If it's gone, MT-3 ships with Stage A (chokepoint) enforcement and real RLS
-- enforcement moves to MT-5 with Supabase Auth. Say that out loud in the MT-3
-- commit rather than letting the RLS policies' mere existence imply
-- protection." So, out loud:
--
--   * The enforcement boundary remains the MT-2 Stage A chokepoint — the
--     mandatory OrgScope on sbSelectAll/sbUpsert/sbDelete/sbInsert
--     (src/lib/supabase.ts §3.4 Stage A). It is app-layer filtering, it is
--     tested, and it is unbypassable BY ACCIDENT because no code path reaches
--     the database around it.
--   * Migration 013's tenant_isolation policies stay correctly-written-but-
--     INERT, exactly as MT-2 documented them. Nothing in this migration makes
--     them live.
--   * Real Postgres-level enforcement arrives with Supabase Auth (Stage C /
--     MT-5), where the org claim comes from a real user JWT this project's
--     asymmetric keys already sign.
--
-- This table itself is NOT tenant-scoped in the §3.4 Stage A sense: the login
-- route has to read it BEFORE it knows the org, so it is queried through
-- getSupabaseClient() directly rather than the four scoped shims. Same carve-
-- out as `organizations` / `org_members` (src/lib/supabase.ts §"SCOPE").
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
-- `passcode_sha` is sha256('ec-coach-auth:' || passcode), byte-identical to
-- hashPasscode() in src/lib/coach/auth.ts:29-35. The salt is a fixed non-secret
-- string; it exists so the stored value is not a bare SHA-256 of a short PIN.
-- The PLAINTEXT PASSCODE IS NEVER STORED, here or anywhere in this repo.
--
-- `role` is carried into the signed session cookie (§3.2) and is the seed of
-- the viewer/coach/owner split. Nothing branches on it yet.
--
-- `active` rather than DELETE: rotating a passcode should leave a record that
-- a passcode existed, and a deactivated row keeps its history while dropping
-- out of the unique index below.
--
-- The composite PK (org_id, passcode_sha) allows one org to hold several live
-- passcodes — a head-coach code and an assistants' code, different roles, same
-- tenant. That is the cheapest real feature this shape gives away for free.
create table if not exists public.org_passcodes (
  org_id       text not null references public.organizations(id) on delete cascade,
  passcode_sha text not null,
  label        text not null default 'Coaches',
  role         text not null default 'coach' check (role in ('owner','coach','viewer')),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  primary key (org_id, passcode_sha)
);

-- ---------------------------------------------------------------------------
-- 2. One passcode resolves to at most one org
-- ---------------------------------------------------------------------------
-- The whole login model rests on this index. Without it, two orgs could choose
-- the same passcode and the lookup would return two rows — a runtime tenancy
-- ambiguity, i.e. the worst possible class of bug in this codebase: a coach
-- from org A silently landing in org B's data.
--
-- With it, that collision is refused by Postgres AT PROVISIONING TIME, when
-- scripts/create-org.mjs runs and a human is watching. §3.2: "a collision is a
-- startup-time error, not a runtime ambiguity."
--
-- Partial (`where active`) so a RETIRED passcode can be re-issued to a
-- different org later without the index objecting to history.
create unique index if not exists idx_org_passcodes_sha
  on public.org_passcodes(passcode_sha)
  where active;

-- Login path: lookup by hash. The unique index above already serves it; this
-- one serves the other direction — "show me this org's live passcodes", which
-- is what any future admin surface asks.
create index if not exists idx_org_passcodes_org
  on public.org_passcodes(org_id)
  where active;

-- ---------------------------------------------------------------------------
-- 3. RLS — deny-all, and this one is NOT inert
-- ---------------------------------------------------------------------------
-- Every other table in 013 got a policy that the service-role connection walks
-- straight through. This table gets NO policy at all, on purpose.
--
-- RLS enabled with zero policies means: anon and authenticated can do nothing,
-- full stop. Supabase grants anon CRUD on every table in `public` by default
-- (verified in MT-2 — see src/lib/supabase.ts's note), so without this the
-- anon key shipped to every browser could SELECT the passcode-hash table and
-- offline-crack short PINs, or INSERT itself a row and mint access to any org.
--
-- The service-role connection (the login route) bypasses this, which is the
-- intent: exactly one server-side code path reads this table.
--
-- Unlike 013's policies, this one enforces TODAY, because its protection comes
-- from the ABSENCE of a policy rather than the presence of one — nothing about
-- it depends on the Stage B JWT that §9.1 ruled out above.
alter table public.org_passcodes enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Seeding org-outlaws is NOT done here
-- ---------------------------------------------------------------------------
-- §7 MT-3 step 1 says "seed Stuart's current APP_PASSCODE as org-outlaws's".
-- That cannot happen in a committed migration:
--
--   1. The live APP_PASSCODE lives in Vercel. It is not in this repo, not in
--      .env.local, and guessing it is out of the question — MERGE-PLAN.md:471
--      shows the OLD published default `outlaws`, and seeding a hash of that
--      would hand org-outlaws to anyone who reads the repository.
--   2. A migration is a git-committed artifact. Even a correct hash of a live
--      4-6 character PIN does not belong in version control.
--
-- Seeding is therefore scripts/seed-owner-passcode.mjs, which reads
-- APP_PASSCODE from the environment, hashes it through the same salted SHA-256
-- as auth.ts, and inserts the row. It never prints the passcode.
--
-- Until that runs, org-outlaws logs in through the APP_PASSCODE fallback that
-- src/app/api/coach/login/route.ts retains for exactly this reason — so this
-- migration changes nothing observable for Stuart, which is MT-3's gate.

-- Report: the table, the index, and how many passcodes exist (expect 0 on a
-- first run — the seed is a separate, uncommitted step by design).
select
  (select count(*) from public.org_passcodes)                 as passcode_rows,
  (select count(*) from public.organizations)                 as org_rows,
  (select relrowsecurity from pg_class where oid = 'public.org_passcodes'::regclass) as rls_enabled;
