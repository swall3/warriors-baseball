-- 013_rls_policies.sql — MT-2: the tenant-isolation policies
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007-012.
-- Plan: MULTI-TENANT-PLAN.md §2.5, §6.1, §9.2, phase MT-2.
--
-- =========================================================================
-- ⚠️⚠️  THESE POLICIES ARE INERT. THEY ENFORCE NOTHING YET.  ⚠️⚠️
-- =========================================================================
--
-- Read this before concluding that tenants are isolated, because
-- MULTI-TENANT-PLAN §9.2 names believing exactly that "the most likely failure
-- mode of this entire plan":
--
--   * Every /coach request path still builds its Supabase client from
--     SUPABASE_SERVICE_ROLE_KEY (src/lib/supabase.ts:23-31, defect T2).
--     service_role carries BYPASSRLS — confirmed against this project's
--     pg_roles, not assumed — so it does not consult a single policy below.
--   * The migration runner is worse: it connects as `postgres`, which ALSO
--     carries BYPASSRLS. `force row level security` below does not change
--     that. FORCE removes the table-OWNER exemption; it cannot remove the
--     role-attribute exemption. A verification query run through
--     scripts/run-migration.mjs therefore sees every row of every tenant and
--     proves nothing about isolation. scripts/verify-mt2.mjs exists because of
--     this: it wraps its checks in `begin; set local role anon; ...; rollback;`
--     so the statements actually execute as a role that RLS applies to.
--
-- WHAT ACTUALLY ISOLATES TENANTS IN MT-2, then, is not this file. It is:
--   1. 011's org-scoped uniques and 012's composite foreign keys, which
--      Postgres enforces against every role including service_role; and
--   2. §3.4 Stage A — the scope-first signatures on src/lib/supabase.ts's four
--      shim functions, which is honest app-layer filtering whose value is that
--      it is unbypassable by accident: there is no path to the database that
--      does not go through those four functions.
--
-- WHEN THIS FILE BECOMES REAL: MT-3, §3.4 Stage B. Request-path queries stop
-- using the service-role client and instead mint a short-lived JWT carrying
-- { role: 'authenticated', org_id } against the ANON key. current_org_ids()
-- below then reads that claim and the policies bite, with Postgres rather than
-- sbSelectAll as the enforcement boundary. That step is conditional on §9.1
-- (whether this project still has a symmetric JWT secret), which is NOT
-- checked here because it gates nothing in MT-2.
--
-- THE ONE EXCEPTION — and it is the whole reason §5.2 pulls a MT-5 task
-- forward into MT-2: `public_signup_insert` at the foot of this file IS live
-- enforcement, as of the application commit that points
-- src/app/api/signup/route.ts at getPublicSupabaseClient() on the anon key.
-- The public tryout form is the only request path in MT-2 that does not hold a
-- BYPASSRLS key, which makes it the only place §2.5's policy design can be
-- proven correct before the JWT plumbing exists. It is tested in both
-- directions by scripts/verify-mt2.mjs.
--
-- RUNS LAST IN MT-2, deliberately (§6.1): it turns on `force row level
-- security`, and every bulk UPDATE in this sequence (006's rename, 009's
-- backfill) must complete before any policy is in force. Ordering it last
-- costs nothing and removes a failure mode where a bulk UPDATE matches zero
-- rows and half-lands silently with a successful exit code.
--
-- Idempotent and forward-only: every policy is dropped before it is created.

-- ---------------------------------------------------------------------------
-- 1. Resolve the caller's orgs once per statement, not once per row
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the function can read org_members without recursing
-- through org_members' own policy.
--
-- Two sources, unioned, in the order they come online:
--   1. An explicit org_id claim on the JWT — the MT-3 custom-JWT bridge (§3.2).
--   2. Membership rows for the authenticated user — the MT-5 Supabase Auth
--      path. Returns nothing until then: org_members stays empty by design
--      (§2.2, and 007's header explains why).
--
-- `select nullif(...)` with no WHERE yields exactly one row, which is NULL
-- when the claim is absent — and `org_id in (select ...)` never matches NULL.
-- So an unclaimed caller sees nothing. That is the same fail-closed behaviour
-- auth.ts:39-43 already establishes for the passcode gate, preserved at the
-- database layer rather than re-argued at it.
--
-- `setof text` rather than a scalar is not over-engineering: a coach may
-- belong to more than one org (§2.2), and MT-5's active-org cookie chooses
-- FOCUS among orgs the JWT already grants ACCESS to (§3.3). A scalar here
-- would have to be redesigned then.
create or replace function public.current_org_ids()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'org_id', '')
  union
  select om.org_id from public.org_members om
   where om.user_id = (select auth.uid());
$$;

-- `(select auth.uid())` rather than bare `auth.uid()` is deliberate: Postgres
-- hoists the scalar subquery into an InitPlan and evaluates it once per
-- statement instead of once per row. This is the standard Supabase RLS
-- performance trap and it is the difference between one evaluation and 119 of
-- them on play_events today — more every game.

revoke all on function public.current_org_ids() from public;
grant execute on function public.current_org_ids() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. One policy shape, applied to every tenant-scoped table
-- ---------------------------------------------------------------------------
-- `force row level security` is not optional: without it the table owner role
-- bypasses RLS even with policies present. (It is still not sufficient — see
-- the BYPASSRLS note in this file's header.)
--
-- `for all` covers select/insert/update/delete, but `using` alone does not
-- constrain inserts — `with check` does. Both clauses are required, or a
-- tenant can write rows stamped with another tenant's org_id.
do $$
declare t text;
begin
  foreach t in array array[
    'teams','games','play_events','players','player_aliases','lineup_plans','tryout_signups'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all
        to authenticated
        using      (org_id in (select public.current_org_ids()))
        with check (org_id in (select public.current_org_ids()))
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. organizations and org_members
-- ---------------------------------------------------------------------------
-- A member may READ their own org row (branding, name). Nobody writes it
-- through PostgREST — org creation is an admin operation run by Stuart from a
-- script (§3.5), deliberately not self-serve.
alter table public.organizations enable row level security;
alter table public.organizations force row level security;
drop policy if exists org_self_read on public.organizations;
create policy org_self_read on public.organizations
  for select to authenticated
  using (id in (select public.current_org_ids()));

-- A user sees their own membership rows and nothing else. Empty until MT-5.
alter table public.org_members enable row level security;
alter table public.org_members force row level security;
drop policy if exists org_members_self on public.org_members;
create policy org_members_self on public.org_members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. The one deliberate public write — AND THE ONE LIVE POLICY (§5.2)
-- ---------------------------------------------------------------------------
-- The public tryout signup form. Insert-only, no select, and only into the
-- owner org.
--
-- Unlike everything above, this policy is NOT inert — as soon as
-- src/app/api/signup/route.ts stops calling getSupabaseClient() (service-role,
-- BYPASSRLS) and starts calling getPublicSupabaseClient() (anon key, no
-- bypass). That application change ships in this same phase, which is what
-- turns this from documentation into enforcement.
--
-- Why it matters beyond the proof: Supabase grants anon full CRUD on every
-- table in `public` by default — verified against this project — so RLS is the
-- only thing standing between the anon key and 179 rows of live data. This
-- policy grants INSERT and nothing else, on one table, into one org. The
-- public site's blast radius becomes one insert instead of the whole database.
--
-- 'org-outlaws' is hardcoded rather than read from a setting because the
-- public site is single-tenant BY DECISION (§5.1), not by omission: it is 364
-- lines of irreducibly East Cherokee content, and templating it is a CMS
-- project whose output is a worse marketing page than the one that exists. A
-- second org gets a link to its own site, not a page here.
--
-- ⚠️ This value and OWNER_ORG_ID in src/lib/tenant/context.ts must agree. If
-- the owner org id ever changes, both change together or the public form
-- starts 500ing on every submission.
drop policy if exists public_signup_insert on public.tryout_signups;
create policy public_signup_insert on public.tryout_signups
  for insert to anon
  with check (org_id = 'org-outlaws');

-- ---------------------------------------------------------------------------
-- Verification — and DO NOT run it through scripts/run-migration.mjs.
--
-- That runner connects as `postgres` (BYPASSRLS), so every query it sends sees
-- everything and a passing result means nothing. Use:
--
--   node scripts/verify-mt2.mjs
--
-- which runs the isolation checks inside
-- `begin; set local role anon; ...; rollback;` — as a role RLS actually
-- applies to — and asserts both directions of public_signup_insert: an insert
-- stamped 'org-outlaws' succeeds, and the same insert stamped 'org-test' is
-- refused by Postgres. Only the two together rule out a blanket deny.
--
-- To confirm the policies exist at all:
--   select tablename, policyname, cmd, roles::text from pg_policies
--    where schemaname='public' order by tablename, policyname;
-- ---------------------------------------------------------------------------
