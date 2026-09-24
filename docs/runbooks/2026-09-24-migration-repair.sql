-- ============================================================================
-- Migration history repair — InningWise prod (project omwqwwflvnunuvgidvwx)
-- 2026-09-24
--
-- Context: several Sep-22/23 migrations were applied to prod BY HAND by build
-- agents and never recorded in supabase_migrations.schema_migrations. A
-- read-only check (ChatGPT, 2026-09-24) found:
--   * custom_practice_drills (20260922193000): NOT recorded, table + the
--     practice_plans columns ABSENT. -> live practice-plan CREATE is broken
--     (plans.ts inserts source_game_id/recommendation_context).
--   * game_progress (20260922200000): NOT recorded, but table/index/RLS/grants
--     EXIST. -> must NOT re-run its CREATE TABLE; reconcile history only.
--
-- This file is PHASE 1: READ-ONLY PREFLIGHT. Run every query, capture output,
-- and return it before running any write (Phase 2, separate file authored
-- after preflight). Nothing here modifies data.
-- ============================================================================

-- 1. FULL recorded migration history (diff this against supabase/migrations/*).
--    ChatGPT only checked versions >= 20260922193000; expect more gaps.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- 2. History-table shape + last rows, so any inserted reconciliation row copies
--    the exact existing column shape (do not guess columns).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'supabase_migrations'
  and table_name = 'schema_migrations'
order by ordinal_position;

select *
from supabase_migrations.schema_migrations
order by version desc
limit 5;

-- 3. Postgres version. custom_practice_drills uses
--    `ON DELETE SET NULL (source_game_id)` (column-list form) -> needs PG15+.
select version();

-- 4. custom_practice_drills preconditions (all must hold before applying it):
--    4a. practice_plans base table exists, and does NOT yet have the 2 columns.
select
  to_regclass('public.practice_plans')                  as practice_plans_table,
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='practice_plans'
       and column_name in ('source_game_id','recommendation_context'))
                                                          as new_cols_present_count; -- expect 0
--    4b. FK targets have PK/unique on (org_id,id).
select conrelid::regclass as tbl, conname, contype
from pg_constraint
where conrelid in ('public.live_games'::regclass, 'public.teams'::regclass)
  and contype in ('p','u')
  and conkey is not null
order by tbl, conname;
--    4c. organizations(id) PK exists (drill FK target).
select conname, contype from pg_constraint
where conrelid='public.organizations'::regclass and contype='p';
--    4d. custom_practice_drills table should be ABSENT.
select to_regclass('public.custom_practice_drills') as custom_practice_drills_table; -- expect null

-- 5. game_progress live-vs-migration diff (it EXISTS; verify it matches
--    20260922200000 + the recorded 20260923031532_atomic_game_progress, which
--    added recent_attempts). Confirm before recording history-only.
--    5a. columns/types/defaults
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema='public' and table_name='game_progress'
order by ordinal_position;
--    5b. constraints (PK + checks)
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint where conrelid='public.game_progress'::regclass
order by contype, conname;
--    5c. index
select indexname, indexdef from pg_indexes
where schemaname='public' and tablename='game_progress';
--    5d. RLS on, and NO grants to anon/authenticated
select relrowsecurity from pg_class where oid='public.game_progress'::regclass; -- expect true
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='game_progress'
order by grantee, privilege_type; -- expect service_role only

-- 6. atomic_game_progress (20260923031532) is RECORDED but altered game_progress
--    (added recent_attempts). Confirm that column is present, so we know the
--    base game_progress DDL really did run even though it was never recorded.
select exists (
  select 1 from information_schema.columns
  where table_schema='public' and table_name='game_progress'
    and column_name='recent_attempts'
) as recent_attempts_present; -- expect true
