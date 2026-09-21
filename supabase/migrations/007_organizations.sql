-- 007_organizations.sql — MT-2: the tenant table
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app). Requires 001-006.
-- Plan: MULTI-TENANT-PLAN.md §2.2, §6.1, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT. Migrations 007-013 create the tenant schema and
-- (in 013) the RLS policies, but those policies do NOT enforce anything yet.
-- The app still connects with SUPABASE_SERVICE_ROLE_KEY, which carries
-- BYPASSRLS and goes straight through every policy (T2). Real enforcement
-- lands in MT-3 §3.4 Stage B via a per-request custom JWT on the anon key.
-- MULTI-TENANT-PLAN §9.2 names "the policies exist, therefore tenants are
-- isolated" as the single most likely way this plan gets believed too early.
-- They are not. The ONE exception is the public tryout-signup insert path
-- (§5.2), which moves onto the anon key in this same phase and is therefore
-- genuinely policed by 013's `public_signup_insert`.
--
-- ORG SHAPE: two levels, org -> teams. Not three. The interested party is a
-- single club with several age-group teams, not a league of independent clubs
-- (Stuart confirmed 2026-09-21), which closes MULTI-TENANT-PLAN §9.7 and §10
-- item 1 in favour of the model §1.1 already specifies.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. The tenant / billing unit
-- ---------------------------------------------------------------------------
-- `id` is text, not uuid, matching the teams/games/players/play_events
-- convention this project has used since schema.sql. A readable primary key is
-- also what makes the backfill in 009 and the verification queries in
-- MULTI-TENANT-PLAN §6.3 legible by eye.
--
-- `slug` exists from day one even though nothing reads it yet: it costs a
-- column now and costs a redirect table after a customer has bookmarked URLs
-- (§5.2).
--
-- `branding` stays '{}' here. MT-4 populates it by transcribing today's values
-- out of src/lib/brand-config.ts and coach.css, so that a no-op visual change
-- is the proof the config wiring works (§7 MT-4 step 1). Seeding a guess now
-- would destroy that test.
create table if not exists public.organizations (
  id          text primary key,                              -- 'org-outlaws'
  slug        text not null unique,                          -- 'outlaws'
  name        text not null,                                 -- 'East Cherokee Outlaws'
  short_name  text,                                          -- 'Outlaws' — scoreboard label (§4)
  branding    jsonb not null default '{}'::jsonb,            -- shape in §4.2; populated in MT-4
  plan        text not null default 'free',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Who may see an org, and as what
-- ---------------------------------------------------------------------------
-- ⚠️ THIS TABLE STAYS EMPTY UNTIL MT-5, BY DESIGN (§2.2). The composite PK
-- makes both columns implicitly NOT NULL, so there is no such thing as a
-- membership row without a real auth.users row — and there are no real user
-- accounts until MT-5 replaces the shared passcode. The MT-3 passcode bridge
-- therefore does NOT write here; during MT-3 the sole source of org identity
-- is org_passcodes + the JWT `org_id` claim, which is branch one of
-- current_org_ids() (013). This table is created now only so branch two of
-- that function compiles against a real relation.
--
-- The many-to-many shape is deliberate and is the reason current_org_ids()
-- returns `setof text` rather than a scalar: a coach can belong to more than
-- one org. Getting that right now costs one composite PK; retrofitting it
-- later costs a session redesign (§2.2, §3.3).
create table if not exists public.org_members (
  org_id     text not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'coach' check (role in ('owner','coach','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists idx_org_members_user on public.org_members(user_id);

-- ---------------------------------------------------------------------------
-- 3. Seed tenant #1
-- ---------------------------------------------------------------------------
-- ⚠️ DELIBERATE DEVIATION FROM THE PLAN'S ORDERING. MULTI-TENANT-PLAN §6.2
-- puts this insert in 009, alongside the backfill. It has to happen here
-- instead, because 008 gives every new org_id column `default 'org-outlaws'`
-- (see 008's header for why that default is required at all). Between 008 and
-- 009 the production deployment is still running older code that inserts
-- tryout_signups rows with no org_id — those inserts would take the default
-- and then fail the foreign key against an organizations table that does not
-- yet contain the row. Creating the table and its first row in one migration
-- closes that window entirely.
--
-- 009 repeats this insert verbatim. That is not a mistake: it keeps 009 a
-- faithful, independently re-runnable copy of §6.2, and `on conflict do
-- nothing` makes the repetition a no-op.
--
-- Stuart's team becomes tenant #1 by the same code path tenant #2 will use.
-- There is no `if (orgId === 'org-outlaws')` anywhere, and the way this is
-- proven is that the org row is created BEFORE the backfill — so from the
-- application's perspective there has never been an un-tenanted row (§6).
insert into public.organizations (id, slug, name, short_name, branding)
values ('org-outlaws', 'outlaws', 'East Cherokee Outlaws', 'Outlaws', '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
-- Enabled here so these two tables are never readable by anon/authenticated
-- between 007 and 013. Supabase grants anon and authenticated full CRUD on
-- every table in `public` by default (verified against this project), so RLS
-- with zero policies is the only thing standing between a leaked anon key and
-- the org list. Policies arrive in 013.
alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;

-- ---------------------------------------------------------------------------
-- Verification (MULTI-TENANT-PLAN §6.3 Block B, first two lines):
--
--   select count(*) from public.organizations;   -- expect 1
--   select count(*) from public.org_members;     -- expect 0 until MT-5
-- ---------------------------------------------------------------------------
