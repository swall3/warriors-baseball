-- ============================================================================
-- Migration history repair — PHASE 2: GUARDED APPLY (WRITE)
-- InningWise prod (project omwqwwflvnunuvgidvwx) — 2026-09-24
--
-- Run via Supabase Management API execute_sql (NOT apply_migration / dashboard:
-- those stamp a NEW timestamp and recreate the version mismatch we are fixing).
-- Owner-run. One transaction: guards first, so ANY failed precondition raises
-- and rolls back the whole thing.
--
-- This file does exactly two things, nothing else:
--   1. Apply custom_practice_drills (20260922193000) — genuinely NOT applied;
--      its absence breaks practice-plan CREATE + the custom-drills UI in prod.
--   2. Record-only history row for game_progress   (20260922200000) — table
--      already EXISTS live (plain CREATE, no IF NOT EXISTS -> never re-run DDL).
--
-- practice_plans (20260922180001) is ALSO unrecorded-but-live, but recording it
-- safely needs a content match (name match != content match), which Phase 1b
-- section 2 proves. It is therefore recorded in Phase 3 alongside the 6
-- unknown-status migrations — NOT here. This file only guards that
-- practice_plans.org_id exists (a precondition of the custom_practice_drills
-- ALTER); it does not verify the whole practice_plans shape.
--
-- The 6 other unrecorded timestamped migrations and the 15 legacy 001..015
-- files are OUT OF SCOPE here (history-only Phase 3, after Phase 1b proves
-- each is live). DO NOT run `supabase db push` / `migration up` against prod:
-- it would re-run every unrecorded CREATE TABLE, incl. game_progress.
--
-- RUN AS A SINGLE execute_sql CALL. If run statement-by-statement, each stmt
-- gets a fresh session, `begin;` applies to nothing, and a failed guard can
-- leave partial DDL committed. One call, whole file.
-- ============================================================================

begin;

-- ---- GUARDS: re-check every precondition; raise (=> rollback) if any fails.
do $$
begin
  if to_regclass('public.custom_practice_drills') is not null then
    raise exception 'ABORT: custom_practice_drills already exists — do not re-apply';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='practice_plans'
               and column_name in ('source_game_id','recommendation_context')) then
    raise exception 'ABORT: practice_plans already has source_game_id/recommendation_context';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='practice_plans'
                   and column_name='org_id') then
    raise exception 'ABORT: practice_plans.org_id missing — ALTER/FK precondition unmet';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid='public.teams'::regclass and contype in ('p','u')
                   and pg_get_constraintdef(oid) ilike '%(org_id, id)%') then
    raise exception 'ABORT: teams has no PK/unique on (org_id,id)';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid='public.live_games'::regclass and contype in ('p','u')
                   and pg_get_constraintdef(oid) ilike '%(org_id, id)%') then
    raise exception 'ABORT: live_games has no PK/unique on (org_id,id)';
  end if;
  if to_regclass('public.organizations') is null then
    raise exception 'ABORT: organizations table missing';
  end if;
end $$;

-- ---- (1) custom_practice_drills DDL — byte-identical to
--       supabase/migrations/20260922193000_custom_practice_drills.sql,
--       with ONLY its own `begin;`/`commit;` stripped (they would break this
--       outer transaction). notify pgrst is delivered at the outer commit.

create table public.custom_practice_drills (
  org_id text not null references public.organizations(id),
  id text not null,
  team_id text not null,
  name text not null,
  category text not null check (category in ('infield','outfield','hitting','throwing','baserunning','team-defense')),
  positions text[] not null default '{}',
  age_bands text[] not null default '{}',
  duration_minutes integer not null check (duration_minutes between 1 and 60),
  players text not null,
  space text not null,
  equipment text[] not null default '{}',
  setup text not null,
  instructions jsonb not null default '[]'::jsonb,
  coaching_cue text,
  scenario_category text check (scenario_category is null or scenario_category in ('cover','backup','relay','miss-recovery')),
  created_by uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id,id),
  foreign key (org_id,team_id) references public.teams(org_id,id) on delete cascade,
  check (cardinality(age_bands) > 0),
  check (cardinality(equipment) > 0),
  check (jsonb_typeof(instructions) = 'array' and jsonb_array_length(instructions) > 0)
);

create index custom_practice_drills_team
  on public.custom_practice_drills(org_id,team_id,updated_at desc);

alter table public.custom_practice_drills enable row level security;
revoke all on public.custom_practice_drills from public,anon,authenticated;
grant select,insert,update,delete on public.custom_practice_drills to service_role;

alter table public.practice_plans
  add column source_game_id text,
  add column recommendation_context jsonb;
alter table public.practice_plans
  add constraint practice_plans_source_game_fk
  foreign key (org_id,source_game_id)
  references public.live_games(org_id,id)
  on delete set null (source_game_id);
create index practice_plans_source_game
  on public.practice_plans(org_id,source_game_id)
  where source_game_id is not null;

notify pgrst, 'reload schema';

-- ---- History rows. Plain INSERT (NOT on conflict do nothing): if a row for
--      any version already exists, something is wrong and this MUST abort.
--      version + name only; statements/created_by left null to match the
--      existing record-only row (parent_multi_kid_invitations / 20260922180000).

--   (1) custom_practice_drills — now genuinely applied above.
insert into supabase_migrations.schema_migrations (version, name)
values ('20260922193000', 'custom_practice_drills');

--   (2) game_progress — record-only (table already live; DDL NOT re-run).
insert into supabase_migrations.schema_migrations (version, name)
values ('20260922200000', 'game_progress');

commit;

-- ---- Read-only verification, AFTER commit (autocommit). A multi-statement
--      endpoint returns only the LAST statement's rows, so the history-rows
--      select is last and is what comes back as proof.
select 'custom_practice_drills exists' as check,
       to_regclass('public.custom_practice_drills')::text as result; -- expect non-null
select 'practice_plans new cols' as check,
       (select count(*) from information_schema.columns
        where table_schema='public' and table_name='practice_plans'
          and column_name in ('source_game_id','recommendation_context')) as result; -- expect 2
select version, name from supabase_migrations.schema_migrations
where version in ('20260922193000','20260922200000')
order by version; -- expect exactly these 2 rows

-- ============================================================================
-- END PHASE 2. After commit, smoke-test in prod: create a custom drill
-- (incl. a miss-recovery drill) and create a practice plan from a game.
-- ============================================================================
