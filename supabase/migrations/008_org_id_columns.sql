-- 008_org_id_columns.sql — MT-2: add the tenant key (nullable, step 1 of 3)
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007.
-- Plan: MULTI-TENANT-PLAN.md §2.3, §6.1, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT — see 007's header. Nothing in this file enforces
-- anything; it adds columns.
--
-- THREE STEPS PER TABLE, and this is step one. `add column ... not null` fails
-- outright on a non-empty table, and six of these seven tables have live rows
-- (2 teams, 2 games, 119 play_events, 11 players, 14 player_aliases, 0
-- lineup_plans, 0 tryout_signups). So: 008 adds nullable, 009 backfills, 010
-- sets not null.
--
-- ---------------------------------------------------------------------------
-- ⚠️ WHY THERE IS A COLUMN DEFAULT, AND WHEN IT GOES AWAY
-- ---------------------------------------------------------------------------
-- MULTI-TENANT-PLAN §2.3's snippet adds these columns with no default. That is
-- correct for a world where the migration and the application deploy together.
-- This one does not: these migrations are being applied to the live production
-- database now, while the deployed Vercel build is still on `master`, 18
-- commits behind this branch. Production's only live writer to this schema is
-- src/app/api/signup/route.ts, which inserts a tryout_signups row with no
-- org_id column in its payload at all — and the /coach routes on this branch
-- will be in the same position for any deploy that lands between 010 and the
-- application commits that follow.
--
-- Without a default, 010's `set not null` turns every one of those inserts
-- into a 500 the moment it is applied. With it, an un-stamped insert from any
-- code version lands on tenant #1, which is exactly where it belongs while
-- tenant #1 is the only tenant.
--
-- This is NOT the T6 defect (a silent tenant-#1 fallback for a missing tenant
-- key in the request path). T6 is about the application choosing a tenant it
-- was not told; this is a database-level floor under code that predates the
-- column existing. The application layer added in this same phase stamps
-- org_id explicitly on every write and never relies on this default.
--
-- ⚠️ DROP THESE DEFAULTS IN MT-3, in the same migration that introduces real
-- per-org resolution (§3.2). Once org identity comes from a passcode lookup
-- rather than a constant, a write with no org_id is a bug and must fail loudly
-- rather than silently landing in Stuart's org.

-- ---------------------------------------------------------------------------
-- 1. org_id on every tenant-scoped table
-- ---------------------------------------------------------------------------
-- Denormalized onto all seven rather than derived through the FK chain
-- (play_events -> games -> teams -> org). An RLS policy that walks three FKs
-- runs a correlated subquery per row; play_events is the table that grows
-- without bound and local-db.ts:109 selects all of it on every dashboard load.
-- A direct column is one index scan (§2.3). 012 keeps the denormalization
-- honest with composite foreign keys.
alter table public.teams          add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.games          add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.play_events    add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.players        add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.player_aliases add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.lineup_plans   add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;
alter table public.tryout_signups add column if not exists org_id text default 'org-outlaws' references public.organizations(id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. teams.kind
-- ---------------------------------------------------------------------------
-- `teams` conflates two different things: OUR teams, and opponent scouting
-- records that sync/game/route.ts:66-71 creates on the fly from whatever name
-- a coach typed. Under multi-tenancy opponent rows must be tenant-owned — a
-- spray chart of the NYO Bucks' hitters is private scouting data that org A
-- paid for with its own game-day attention. Two orgs that both play the Bucks
-- get two teams rows. That is duplication, and it is correct (§2.3).
--
-- `kind` says which is which explicitly, rather than inferring it from "is
-- this row referenced by players". Default 'opponent' because that is what the
-- overwhelming majority of rows will always be; 009 promotes team-outlaws.
alter table public.teams add column if not exists kind text not null default 'opponent';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.teams'::regclass and conname = 'teams_kind_check') then
    alter table public.teams add constraint teams_kind_check check (kind in ('own','opponent'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Verification (all seven columns present and still nullable at this point):
--
--   select table_name, column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_schema='public' and column_name='org_id' order by table_name;
-- ---------------------------------------------------------------------------
