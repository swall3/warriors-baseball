-- 006_rename_perspective.sql — MT-1: "outlaws/opponent" -> "us/them"
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app). Requires 001-004.
-- Plan: MULTI-TENANT-PLAN.md §2.6, phase MT-1.
--
-- WHAT THIS IS, AND WHAT IT IS NOT
--
-- This is NOT the multi-tenant migration. It carries zero tenancy semantics
-- and adds no org_id anywhere. It exists because `outlaws` leaked out of
-- branding and into the *schema*: two column names on `games`, one on
-- `play_events`, and a check-constraint enum value — surfaced in code as
-- `export type TeamAtBat = "outlaws" | "opponent"`.
--
-- The organizing finding of MULTI-TENANT-PLAN §0.2 is that `batting_team` is a
-- PERSPECTIVE flag ("the team keeping score" vs "the other guys"), not a tenant
-- key. Conflating the two leads to the conclusion that `batting_team` should
-- hold an org_id, which is wrong, expensive, and breaks every aggregation in
-- src/lib/coach/analytics.ts. So: rename first, add tenancy second. Two
-- workstreams, not one — which is why this is 006 and the org tables are 007+.
--
-- `opponent` -> `them` comes along in the same statement set. It is not
-- strictly required, but leaving a two-value enum half-renamed ("us" paired
-- with "opponent") is a worse resting state than either end of the rename.
--
-- ⚠️ SERIAL WITH THE CODE RENAME. This migration and the TypeScript rename
-- must ship in the same deploy. A pod running the old code against the new
-- columns reads undefined scores; the new code against the old columns reads
-- nothing at all. They are one commit for that reason.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run. The column
-- renames are guarded on information_schema because `alter table ... rename
-- column` has no `if exists` form for this direction, and the value updates are
-- naturally no-ops on a second pass.

-- ---------------------------------------------------------------------------
-- 1. Column renames
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'games'
                and column_name = 'outlaws_score') then
    alter table public.games rename column outlaws_score to us_score;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'games'
                and column_name = 'outlaws_home') then
    alter table public.games rename column outlaws_home to us_home;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'play_events'
                and column_name = 'outlaws_runs_after') then
    alter table public.play_events rename column outlaws_runs_after to us_runs_after;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. batting_team value migration
--
-- ⚠️ ORDER MATTERS, and not in the obvious way. MULTI-TENANT-PLAN §2.6's own
-- code block gets this wrong and then warns about it in the footnote: if the
-- new constraint is re-added after the 'outlaws' -> 'us' update but BEFORE the
-- 'opponent' -> 'them' update, it is validated against 60 rows that still say
-- 'opponent' and the ALTER fails. Both updates run before the constraint comes
-- back. The corrected order is used here.
--
-- The constraint name below is not a guess — it was read out of pg_constraint
-- against the live database first, because `drop constraint if exists` on a
-- wrong name is a silent no-op and the `add constraint` that follows would
-- then fail on a duplicate name. Confirmed as:
--   play_events_batting_team_check
--   CHECK ((batting_team = ANY (ARRAY['outlaws'::text, 'opponent'::text])))
-- ---------------------------------------------------------------------------

alter table public.play_events drop constraint if exists play_events_batting_team_check;

update public.play_events set batting_team = 'us'   where batting_team = 'outlaws';
update public.play_events set batting_team = 'them' where batting_team = 'opponent';

alter table public.play_events add constraint play_events_batting_team_check
  check (batting_team in ('us', 'them'));

-- ---------------------------------------------------------------------------
-- 3. Verification — MULTI-TENANT-PLAN §6.3 Block A
--
-- Run these two together and read them together. The second one alone is a
-- trap: before this migration it returns 0 because no row says 'us' yet, so an
-- empty result is indistinguishable from a healthy one. The group-by above it
-- is what makes the zero mean something.
--
--   select batting_team, count(*) from public.play_events group by 1;
--   -- expect exactly: us = 59, them = 60   (119 total, no 'outlaws'/'opponent')
--
--   select count(*) from public.play_events
--    where batter_player_id is null and batting_team = 'us';
--   -- expect 0 — the Phase 2 backfill survived the rename
-- ---------------------------------------------------------------------------
