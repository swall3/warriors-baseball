-- 009_backfill_org.sql — MT-2: every existing row joins tenant #1 (step 2 of 3)
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007, 008.
-- Plan: MULTI-TENANT-PLAN.md §6.2, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT — see 007's header.
--
-- Every statement is guarded on `org_id is null` (or is an idempotent
-- conflict-swallowing insert), so this file is re-runnable, matching
-- MERGE-PLAN §7.6's forward-only rule and 005_backfill_batter_player_id.sql's
-- precedent. Re-running it after a second org exists is a no-op, not a
-- catastrophe — that is the whole point of the null guard.
--
-- This runs before 013 enables row level security. MULTI-TENANT-PLAN §6.1
-- makes that ordering load-bearing: a bulk UPDATE under an unexpectedly active
-- policy can match zero rows and leave the backfill half-landed with a
-- successful exit code.

-- ---------------------------------------------------------------------------
-- 1. Tenant #1
-- ---------------------------------------------------------------------------
-- Repeated verbatim from 007 so this file remains a faithful, independently
-- runnable copy of §6.2. `on conflict do nothing` makes the repeat a no-op;
-- 007 is where it actually fires (see 007 §3 for why it had to move earlier).
insert into public.organizations (id, slug, name, short_name, branding)
values ('org-outlaws', 'outlaws', 'East Cherokee Outlaws', 'Outlaws', '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Stamp every existing row
-- ---------------------------------------------------------------------------
update public.teams          set org_id = 'org-outlaws' where org_id is null;
update public.games          set org_id = 'org-outlaws' where org_id is null;
update public.play_events    set org_id = 'org-outlaws' where org_id is null;
update public.players        set org_id = 'org-outlaws' where org_id is null;
update public.player_aliases set org_id = 'org-outlaws' where org_id is null;
update public.lineup_plans   set org_id = 'org-outlaws' where org_id is null;
update public.tryout_signups set org_id = 'org-outlaws' where org_id is null;

-- ---------------------------------------------------------------------------
-- 3. Separate our team from the opponents we have scouted
-- ---------------------------------------------------------------------------
-- 'team-outlaws' is a row id, not a label — deliberately untouched by 006,
-- which renamed only the perspective vocabulary. It is matched literally here
-- for the same reason the 006 constraint name was read out of pg_constraint
-- first: this is the one value in the live database that identifies which of
-- the three teams rows is ours.
--
-- Scoped to org-outlaws rather than applied globally, so a re-run after tenant
-- #2 exists cannot reclassify another org's teams.
update public.teams set kind = 'own'
 where id = 'team-outlaws' and org_id = 'org-outlaws';

update public.teams set kind = 'opponent'
 where id <> 'team-outlaws' and org_id = 'org-outlaws';

-- ---------------------------------------------------------------------------
-- Verification (MULTI-TENANT-PLAN §6.3 Block B — run AFTER 010):
--
--   select count(*) from public.organizations;                       -- 1
--   select count(*) from public.org_members;                         -- 0 until MT-5
--   select count(*) from public.teams          where org_id is null; -- 0 (of 3)
--   select count(*) from public.games          where org_id is null; -- 0 (of 2)
--   select count(*) from public.play_events    where org_id is null; -- 0 (of 119)
--   select count(*) from public.players        where org_id is null; -- 0 (of 11)
--   select count(*) from public.player_aliases where org_id is null; -- 0 (of 14)
--   select count(*) from public.lineup_plans   where org_id is null; -- 0 (of 0)
--   select count(*) from public.tryout_signups where org_id is null; -- 0 (of 0)
--   select kind, count(*) from public.teams group by 1;              -- own=1, opponent=2
-- ---------------------------------------------------------------------------
