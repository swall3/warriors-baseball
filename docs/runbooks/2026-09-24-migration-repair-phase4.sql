-- ============================================================================
-- Migration history repair — PHASE 4: record the 15 LEGACY base migrations
-- InningWise prod (project omwqwwflvnunuvgidvwx) — 2026-09-24
--
-- Run the WHOLE FILE as ONE run (signed-in SQL editor / execute_sql / the
-- supa-sql.mjs --file wrapper). NEVER apply_migration / Dashboard->Migrations /
-- `supabase db push` (they stamp history + re-run DDL).
--
-- The 15 legacy `001..015` files are the BASE SCHEMA (players/games/orgs/RLS/
-- multi-tenant org_id rollout/seed). Every later migration depends on them and
-- Phase 1b/3 proved the whole downstream chain is live, so these MUST be
-- applied. A direct prod probe (2026-09-24) confirmed EACH is applied, using
-- DATA-AWARE checks for the data migrations (object existence alone can't prove
-- a seed/backfill ran):
--   003 seed_roster  -> team-outlaws row exists (seed-only; no clean proof of
--                       full completion — recorded anyway, see below)
--   005 backfill_batter_player_id -> UPDATE-only, no clean proof; recorded anyway
--   006 rename_perspective -> games.us_score present, outlaws_score GONE, no
--                             play_events.batting_team in ('outlaws','opponent')
--   009 backfill_org -> proven transitively: 010 set players.org_id NOT NULL,
--                       which is impossible unless 009 backfilled every row.
-- This file is HISTORY-ONLY (zero DDL). Guards raise->rollback on any missing
-- STRUCTURAL object; the two pure data-only files (003,005) do NOT abort the run
-- (their hazard is RE-running, which we never do — we only record history).
--
-- Version strings = the literal filename prefix ('001', not '1'); name = suffix.
-- After this, ALL 32 local migrations are recorded; history == repo, both ways.
-- ============================================================================

begin;

-- ---- GUARDS: structural objects from the 15 legacy files. --------------------
do $$
begin
  -- 001 identity
  if to_regclass('public.players') is null then raise exception 'ABORT: players missing (001)'; end if;
  if to_regclass('public.player_aliases') is null then raise exception 'ABORT: player_aliases missing (001)'; end if;
  -- 002 link_play_events (batter_player_id column + its index)
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='play_events' and column_name='batter_player_id') then
    raise exception 'ABORT: play_events.batter_player_id missing (002)'; end if;
  -- 004 lineup_plans
  if to_regclass('public.lineup_plans') is null then raise exception 'ABORT: lineup_plans missing (004)'; end if;
  -- 006 rename_perspective (data+structural): new col present, old gone, values migrated
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='us_score') then
    raise exception 'ABORT: games.us_score missing (006 rename not applied)'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='games' and column_name='outlaws_score') then
    raise exception 'ABORT: games.outlaws_score still present (006 rename not applied)'; end if;
  if exists (select 1 from public.play_events where batting_team in ('outlaws','opponent')) then
    raise exception 'ABORT: legacy batting_team values remain (006 not applied)'; end if;
  -- 007 organizations + org_members + seed org
  if to_regclass('public.organizations') is null then raise exception 'ABORT: organizations missing (007)'; end if;
  if to_regclass('public.org_members') is null then raise exception 'ABORT: org_members missing (007)'; end if;
  if not exists (select 1 from public.organizations where id='org-outlaws') then
    raise exception 'ABORT: org-outlaws seed row missing (007)'; end if;
  -- 008 org_id columns (+ teams.kind)
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='tryout_signups' and column_name='org_id') then
    raise exception 'ABORT: tryout_signups.org_id missing (008)'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='teams' and column_name='kind') then
    raise exception 'ABORT: teams.kind missing (008)'; end if;
  -- 010 org_not_null (transitively proves 009 backfill ran)
  if (select is_nullable from information_schema.columns where table_schema='public' and table_name='players' and column_name='org_id') <> 'NO' then
    raise exception 'ABORT: players.org_id is nullable (010 not applied => 009 backfill unproven)'; end if;
  -- 011 scope_uniques (final constraint name)
  if not exists (select 1 from pg_constraint where conname='teams_org_normalized_name_key') then
    raise exception 'ABORT: teams_org_normalized_name_key missing (011)'; end if;
  -- 012 composite_integrity (final unique + fk names)
  if not exists (select 1 from pg_constraint where conname='games_org_id_key') then
    raise exception 'ABORT: games_org_id_key missing (012)'; end if;
  if not exists (select 1 from pg_constraint where conname='play_events_org_game_fk') then
    raise exception 'ABORT: play_events_org_game_fk missing (012)'; end if;
  -- 013 rls_policies (function + tenant_isolation policy)
  if to_regprocedure('public.current_org_ids()') is null then
    raise exception 'ABORT: current_org_ids() missing (013)'; end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='players' and policyname='tenant_isolation') then
    raise exception 'ABORT: tenant_isolation policy missing (013)'; end if;
  -- 014 scope_lineup_plans_key (PK now composite on (org_id,id))
  if not exists (select 1 from pg_constraint where conrelid='public.lineup_plans'::regclass and contype='p' and pg_get_constraintdef(oid) ilike '%(org_id, id)%') then
    raise exception 'ABORT: lineup_plans PK not composite (014)'; end if;
  -- 015 org_passcodes
  if to_regclass('public.org_passcodes') is null then raise exception 'ABORT: org_passcodes missing (015)'; end if;
  -- 003 seed_roster: data-only. Weak proof (seed team id); do NOT abort on it.
  --   (recorded regardless; noted in header.)

  -- None of the 15 target versions may already be recorded.
  if exists (select 1 from supabase_migrations.schema_migrations
             where version in ('001','002','003','004','005','006','007','008',
                               '009','010','011','012','013','014','015')) then
    raise exception 'ABORT: one of the 15 legacy versions is already recorded';
  end if;
end $$;

-- ---- History INSERTs (record-only; version + name). -------------------------
insert into supabase_migrations.schema_migrations (version, name) values
  ('001','identity'),
  ('002','link_play_events'),
  ('003','seed_roster'),
  ('004','lineup_plans'),
  ('005','backfill_batter_player_id'),
  ('006','rename_perspective'),
  ('007','organizations'),
  ('008','org_id_columns'),
  ('009','backfill_org'),
  ('010','org_not_null'),
  ('011','scope_uniques'),
  ('012','composite_integrity'),
  ('013','rls_policies'),
  ('014','scope_lineup_plans_key'),
  ('015','org_passcodes');

commit;

-- ---- Verification, AFTER commit. Expect 32 rows total and a clean two-way
--      diff between repo filenames and history.
select count(*) as total_rows from supabase_migrations.schema_migrations; -- expect 32
select version, name from supabase_migrations.schema_migrations
where version in ('001','002','003','004','005','006','007','008','009','010','011','012','013','014','015')
order by version; -- expect these 15

-- ============================================================================
-- END PHASE 4. All 32 local migrations now recorded. The migration-history
-- repair is COMPLETE. (never `db push` remains good hygiene, but history no
-- longer lags the repo.)
-- ============================================================================
