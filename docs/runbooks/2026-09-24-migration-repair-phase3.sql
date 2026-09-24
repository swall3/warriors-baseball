-- ============================================================================
-- Migration history repair — PHASE 3: HISTORY-ONLY RECONCILE (record 7 live)
-- InningWise prod (project omwqwwflvnunuvgidvwx) — 2026-09-24
--
-- RUN ONLY AFTER PHASE 2 HAS COMMITTED. Run the WHOLE FILE as ONE run in the
-- signed-in SQL editor, OR one execute_sql call. NEVER apply_migration,
-- Dashboard->Migrations, or `supabase db push`: those STAMP history and would
-- re-run DDL. Raw SQL in the SQL editor stamps nothing — that is the safe route.
--
-- Phase 1b proved these 7 timestamped migrations are ALREADY APPLIED live but
-- never recorded. This file records them — ZERO DDL, only history INSERTs —
-- behind a guard block that re-verifies EVERY object each migration creates
-- (not one signature per file: recording a partially-applied migration would
-- bury drift permanently, which is the exact bug this whole repair fixes).
--
-- OUT OF SCOPE (do NOT fold in): the 15 legacy 001..015 files. Several are DATA
-- migrations (seed_roster, backfills) whose application an object-existence
-- check cannot prove; they get a separate Phase 4 with data checks. Keep the
-- never-`db push` warning in force until then.
--
-- The 7 recorded here (exact filename suffix = name):
--   20260921192619 live_game_commands
--   20260921195625 live_training_and_event_context
--   20260922041841 historical_sync_atomic
--   20260922150000 position_practice_bundles
--   20260922160000 org_billing
--   20260922170000 org_billing_notifications
--   20260922180001 practice_plans
-- ============================================================================

begin;

-- ---- GUARDS: raise (=> rollback) if any precondition fails. -----------------
do $$
begin
  -- (0) Phase 2 must have landed first, and via a history-clean route.
  if to_regclass('public.custom_practice_drills') is null then
    raise exception 'ABORT: custom_practice_drills missing — run Phase 2 first';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations
                 where version='20260922193000' and name='custom_practice_drills') then
    raise exception 'ABORT: custom_practice_drills history row (20260922193000) missing — run Phase 2 first';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations
                 where version='20260922200000' and name='game_progress') then
    raise exception 'ABORT: game_progress history row (20260922200000) missing — run Phase 2 first';
  end if;
  -- Phase 2's route must not have re-stamped history under other versions.
  if exists (select 1 from supabase_migrations.schema_migrations
             where name in ('custom_practice_drills','game_progress')
               and version not in ('20260922193000','20260922200000')) then
    raise exception 'ABORT: custom_practice_drills/game_progress recorded under an unexpected version — Phase 2 route re-stamped history';
  end if;

  -- (1) live_game_commands (20260921192619): 3 tables + fn (last objects).
  if to_regclass('public.live_game_grants') is null then
    raise exception 'ABORT: live_game_grants missing (live_game_commands not fully applied)';
  end if;
  if to_regprocedure('public.commit_live_game_command(text,text,text,integer,jsonb,jsonb,text,text)') is null then
    raise exception 'ABORT: commit_live_game_command(...) missing';
  end if;

  -- (2) live_training_and_event_context (20260921195625): table + view + the
  --     ALTER that added live_game_commands.after_state.
  if to_regclass('public.training_attempts') is null then
    raise exception 'ABORT: training_attempts missing';
  end if;
  if to_regclass('public.training_progress') is null then
    raise exception 'ABORT: training_progress view missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='live_game_commands'
                   and column_name='after_state') then
    raise exception 'ABORT: live_game_commands.after_state missing';
  end if;

  -- (3) historical_sync_atomic (20260922041841): fn + index.
  if to_regprocedure('public.sync_historical_game(text,jsonb,jsonb)') is null then
    raise exception 'ABORT: sync_historical_game(...) missing';
  end if;
  if to_regclass('public.idx_play_events_org_game') is null then
    raise exception 'ABORT: idx_play_events_org_game missing';
  end if;

  -- (4) position_practice_bundles (20260922150000): table + 2nd view + the
  --     training_assignments column/FK it added.
  if to_regclass('public.training_practice_bundles') is null then
    raise exception 'ABORT: training_practice_bundles missing';
  end if;
  if to_regclass('public.training_bundle_progress') is null then
    raise exception 'ABORT: training_bundle_progress view missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='training_assignments'
                   and column_name='bundle_assignment_id') then
    raise exception 'ABORT: training_assignments.bundle_assignment_id missing';
  end if;

  -- (5) org_billing (20260922160000): table + fn + the teams.seat_state column.
  if to_regclass('public.org_billing') is null then
    raise exception 'ABORT: org_billing missing';
  end if;
  if to_regprocedure('public.acquire_org_billing_lease(uuid,uuid)') is null then
    raise exception 'ABORT: acquire_org_billing_lease(...) missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='teams'
                   and column_name='seat_state') then
    raise exception 'ABORT: teams.seat_state missing (org_billing not fully applied)';
  end if;

  -- (6) org_billing_notifications (20260922170000): 2 fns + the trigger (last).
  if to_regprocedure('public.notify_org_billing_change()') is null then
    raise exception 'ABORT: notify_org_billing_change() missing';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname='queue_org_billing_email'
                   and tgrelid='public.org_billing'::regclass) then
    raise exception 'ABORT: trigger queue_org_billing_email missing';
  end if;

  -- (7) practice_plans (20260922180001): base cols present (NOT an exact count —
  --     Phase 2 adds source_game_id/recommendation_context), PK, FK to teams.
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='practice_plans'
                   and column_name='org_id') then
    raise exception 'ABORT: practice_plans.org_id missing';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='practice_plans'
                   and column_name='blocks') then
    raise exception 'ABORT: practice_plans.blocks missing';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid='public.practice_plans'::regclass and contype='p'
                   and pg_get_constraintdef(oid) ilike '%(org_id, id)%') then
    raise exception 'ABORT: practice_plans PK (org_id,id) missing';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid='public.practice_plans'::regclass and contype='f'
                   and pg_get_constraintdef(oid) ilike '%teams(org_id, id)%') then
    raise exception 'ABORT: practice_plans FK to teams(org_id,id) missing';
  end if;

  -- None of the 7 target versions may already be recorded (plain INSERT below
  -- would error anyway; this gives a clearer message).
  if exists (select 1 from supabase_migrations.schema_migrations
             where version in ('20260921192619','20260921195625','20260922041841',
                               '20260922150000','20260922160000','20260922170000',
                               '20260922180001')) then
    raise exception 'ABORT: one of the 7 target versions is already recorded';
  end if;
end $$;

-- ---- History INSERTs (record-only; version + name, matching existing rows).
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260921192619','live_game_commands'),
  ('20260921195625','live_training_and_event_context'),
  ('20260922041841','historical_sync_atomic'),
  ('20260922150000','position_practice_bundles'),
  ('20260922160000','org_billing'),
  ('20260922170000','org_billing_notifications'),
  ('20260922180001','practice_plans');

commit;

-- ---- Verification, AFTER commit (autocommit). Last select = closing proof
--      that repo timestamped versions == recorded history, both directions.
select version, name from supabase_migrations.schema_migrations
where version in ('20260921192619','20260921195625','20260922041841',
                  '20260922150000','20260922160000','20260922170000','20260922180001')
order by version; -- expect these 7

-- Closing proof: the 17 EXPECTED recorded versions (3 re-timestamped +
-- 7 Phase 3 + 2 Phase 2 + parent_multi_kid + the 4 Sep-23 already-recorded).
-- team_billing/email_notifications/organization_team_access use the RECORDED
-- (re-timestamped) versions 120148/133551/142727, NOT the old local filenames.
-- Expect expected_total = 17 and expected_recorded = 17 (all present).
with expected(version) as (values
  ('20260921192619'),('20260921195625'),('20260922041841'),
  ('20260922120148'),('20260922133551'),('20260922142727'),
  ('20260922150000'),('20260922160000'),('20260922170000'),
  ('20260922180000'),('20260922180001'),('20260922193000'),('20260922200000'),
  ('20260923031532'),('20260923034959'),('20260923125345'),('20260923173353')
)
select
  (select count(*) from supabase_migrations.schema_migrations) as recorded_rows_total,
  (select count(*) from expected) as expected_total, -- 17
  (select count(*) from expected e
     where exists (select 1 from supabase_migrations.schema_migrations m
                   where m.version=e.version)) as expected_recorded, -- want 17
  (select string_agg(m.version||' '||m.name, ', ' order by m.version)
     from supabase_migrations.schema_migrations m
     where not exists (select 1 from expected e where e.version=m.version))
     as unexpected_extra_rows; -- want NULL (nothing recorded that we didn't expect)

-- ============================================================================
-- END PHASE 3. After this, master's timestamped filenames == prod history ->
-- merge PR #48. Legacy 001..015 remain (Phase 4, data-aware). Until then:
-- NEVER `supabase db push` / `migration up` against prod.
-- ============================================================================
