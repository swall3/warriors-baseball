-- 004_lineup_plans.sql — Phase 3: defense rotation persistence
--
-- Run against omwqwwflvnunuvgidvwx (Outlaws-field0app) — the single project
-- shared by the Warriors public site and the /coach tool. See MERGE-PLAN.md §3.1.
--
-- Today `defenseGroups` + `inningDefenseGroup` live ONLY in localStorage under
-- `outlaws-field-app:v1`. Lose the phone, lose the plan, and the dashboard on a
-- laptop sees nothing. This table is the server-side home for that data; the
-- client keeps localStorage as its write-ahead buffer and syncs opportunistically.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ⚠️ BELONGS IN 001_identity.sql — included here because migrations 001–003 do
-- not exist in this repo yet (MERGE-PLAN.md §8 task S5 is still open).
--
-- `public.teams` currently holds ONLY opponent teams: `team-nyo-bucks` and
-- `team-oregon-park-wahoos` (verified in outlaws-field-app/supabase/schema.sql
-- lines 61-62). There is no row for our own team. Since `lineup_plans.team_id`
-- is `not null references public.teams(id)` per the plan, the table below would
-- be unwritable without this row.
--
-- The id `team-outlaws` is not invented here — MERGE-PLAN.md §2.3 already seeds
-- `public.players` with `team_id = 'team-outlaws'`. When 001 lands, move this
-- insert there and delete it from this file.
-- ---------------------------------------------------------------------------
insert into public.teams (id, name, normalized_name)
values ('team-outlaws', 'Outlaws', 'outlaws')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The plan itself. Column definitions are verbatim from MERGE-PLAN.md §Phase 3.
-- ---------------------------------------------------------------------------
create table if not exists public.lineup_plans (
  id          text primary key,
  game_id     text references public.games(id) on delete cascade,
  team_id     text not null references public.teams(id),
  label       text not null default 'Game plan',
  format      text not null default 'coach_pitch' check (format in ('coach_pitch','kid_pitch')),
  batting_order jsonb not null default '[]'::jsonb,   -- [player_id, …]
  groups      jsonb not null default '{}'::jsonb,     -- {A1:{SS:player_id,…},…}
  inning_map  jsonb not null default '{}'::jsonb,     -- {1:'A1',2:'A2',…}
  updated_at  timestamptz not null default now()
);

create index if not exists idx_lineup_plans_game on public.lineup_plans(game_id);

-- `game_id` is nullable on purpose: a coach builds next Saturday's defense on
-- the couch, before any game row exists. The plan is written with game_id null
-- and gets attached once the game is scored and synced.
create index if not exists idx_lineup_plans_team on public.lineup_plans(team_id);

-- RLS on, matching every other table in this project (MERGE-PLAN.md §3.3).
-- The service-role key used by /api/coach/* bypasses RLS; a leaked anon key
-- yields nothing because no policy grants it anything.
alter table public.lineup_plans enable row level security;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from public.teams where id = 'team-outlaws';   -- expect 1
--   select count(*) from public.lineup_plans;                      -- expect 0
--   insert into public.lineup_plans (id, team_id) values ('lp-smoke','team-outlaws');
--   delete from public.lineup_plans where id = 'lp-smoke';
-- ---------------------------------------------------------------------------
