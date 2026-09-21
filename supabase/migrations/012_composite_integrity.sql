-- 012_composite_integrity.sql — MT-2: cross-tenant references become impossible
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007-011.
-- Plan: MULTI-TENANT-PLAN.md §2.3, §6.1, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT — see 007's header. This file, like 011, is NOT
-- inert: foreign keys are enforced against every role including service-role.
-- After this migration a play event, a player, an alias, or a lineup plan in
-- org A cannot reference a game or team in org B. Not "should not" — the
-- database refuses the row.
--
-- This is what keeps 008's denormalized org_id honest. Denormalizing a tenant
-- key onto seven tables buys index-scan RLS instead of three-FK-deep
-- correlated subqueries (§2.3), and the bill for it is the possibility of a
-- row whose org_id disagrees with the org_id of the row it points at.
-- Composite FKs are that bill, paid in full.
--
-- EVERY cross-table reference, not just the obvious ones. A composite FK on
-- play_events while players.team_id keeps a single-column FK leaves the hole
-- open somewhere less visible.
--
-- ON DELETE behaviour is preserved verbatim from the originals, which were
-- read out of pg_constraint against the live database rather than assumed:
--   games_opponent_team_id_fkey        (opponent_team_id) -> teams(id)   ON DELETE RESTRICT
--   play_events_game_id_fkey           (game_id)          -> games(id)   ON DELETE CASCADE
--   play_events_batter_player_id_fkey  (batter_player_id) -> players(id) ON DELETE SET NULL
--   players_team_id_fkey               (team_id)          -> teams(id)   ON DELETE RESTRICT
--   player_aliases_player_id_fkey      (player_id)        -> players(id) ON DELETE CASCADE
--   lineup_plans_game_id_fkey          (game_id)          -> games(id)   ON DELETE CASCADE
--   lineup_plans_team_id_fkey          (team_id)          -> teams(id)   (no action)
--
-- Each original is DROPPED and REPLACED, never supplemented. Leaving both
-- means two overlapping constraints per relation and a confusing error message
-- when one of them fires.

-- ---------------------------------------------------------------------------
-- 1. The (org_id, id) uniques the composite FKs target
-- ---------------------------------------------------------------------------
-- Redundant as uniqueness — `id` is already a primary key on all three — but a
-- composite foreign key requires a unique constraint over exactly its
-- referenced column list. These also give teams/games/players an index leading
-- with org_id, which is what the org-scoped selects in §3.4 Stage A will use.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_org_id_key'
                   and conrelid = 'public.teams'::regclass) then
    alter table public.teams add constraint teams_org_id_key unique (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'games_org_id_key'
                   and conrelid = 'public.games'::regclass) then
    alter table public.games add constraint games_org_id_key unique (org_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'players_org_id_key'
                   and conrelid = 'public.players'::regclass) then
    alter table public.players add constraint players_org_id_key unique (org_id, id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Replace every single-column FK with its composite form
-- ---------------------------------------------------------------------------

-- play_events -> games
alter table public.play_events drop constraint if exists play_events_game_id_fkey;
alter table public.play_events drop constraint if exists play_events_org_game_fk;
alter table public.play_events add constraint play_events_org_game_fk
  foreign key (org_id, game_id) references public.games(org_id, id) on delete cascade;

-- play_events -> players
--
-- ⚠️ THIS ONE IS NOT IN THE PLAN'S §2.3 LIST, and it has a trap in it.
-- §2.3 says "do this for every cross-table reference" and then enumerates five,
-- omitting play_events.batter_player_id — the FK 002_link_play_events.sql
-- added. Without it, org A's play event could name org B's player id, which is
-- precisely the aggregation-poisoning §2.3 exists to prevent.
--
-- The trap: a plain `on delete set null` on a two-column FK nulls ALL the
-- referencing columns, including org_id — which is NOT NULL as of 010, so
-- deleting a player would fail with a not-null violation instead of clearing
-- the reference. Postgres 15+ takes a column list on SET NULL naming which
-- columns to clear; this project is on 17.6 (verified live), so the original
-- ON DELETE SET NULL behaviour survives intact and applies to
-- batter_player_id alone.
--
-- MATCH SIMPLE (the default) means a row with batter_player_id IS NULL
-- satisfies the constraint regardless of org_id — which matters, because
-- unresolved batters are a normal state (005's backfill leaves 'them' rows
-- null by design).
alter table public.play_events drop constraint if exists play_events_batter_player_id_fkey;
alter table public.play_events drop constraint if exists play_events_org_batter_fk;
alter table public.play_events add constraint play_events_org_batter_fk
  foreign key (org_id, batter_player_id) references public.players(org_id, id)
  on delete set null (batter_player_id);

-- games -> teams (the opponent scouting record)
alter table public.games drop constraint if exists games_opponent_team_id_fkey;
alter table public.games drop constraint if exists games_org_opponent_fk;
alter table public.games add constraint games_org_opponent_fk
  foreign key (org_id, opponent_team_id) references public.teams(org_id, id) on delete restrict;

-- players -> teams
alter table public.players drop constraint if exists players_team_id_fkey;
alter table public.players drop constraint if exists players_org_team_fk;
alter table public.players add constraint players_org_team_fk
  foreign key (org_id, team_id) references public.teams(org_id, id) on delete restrict;

-- player_aliases -> players
alter table public.player_aliases drop constraint if exists player_aliases_player_id_fkey;
alter table public.player_aliases drop constraint if exists player_aliases_org_player_fk;
alter table public.player_aliases add constraint player_aliases_org_player_fk
  foreign key (org_id, player_id) references public.players(org_id, id) on delete cascade;

-- lineup_plans -> games
alter table public.lineup_plans drop constraint if exists lineup_plans_game_id_fkey;
alter table public.lineup_plans drop constraint if exists lineup_plans_org_game_fk;
alter table public.lineup_plans add constraint lineup_plans_org_game_fk
  foreign key (org_id, game_id) references public.games(org_id, id) on delete cascade;

-- lineup_plans -> teams
alter table public.lineup_plans drop constraint if exists lineup_plans_team_id_fkey;
alter table public.lineup_plans drop constraint if exists lineup_plans_org_team_fk;
alter table public.lineup_plans add constraint lineup_plans_org_team_fk
  foreign key (org_id, team_id) references public.teams(org_id, id);

-- tryout_signups needs no composite FK: the live table has no player_id and no
-- team_id column at all — verified against information_schema before writing
-- this file, which resolves MULTI-TENANT-PLAN §6.5 item 1. The deployed
-- definition is supabase-setup.sql:3-14 (10 columns, no eval fields), NOT the
-- MERGE-PLAN §3.3 variant. §2.3's conditional warning about
-- tryout_signups.player_id therefore does not apply. MERGE-PLAN Phase 4's
-- eval columns, when they are added, must be created WITH org_id in one
-- migration rather than retrofitted (§7.6).

-- ---------------------------------------------------------------------------
-- 3. Indexes on org_id where no unique already provides one
-- ---------------------------------------------------------------------------
-- teams/games/players get theirs from section 1's (org_id, id) uniques, and
-- player_aliases from 011's (org_id, alias) primary key. The three below have
-- no org-leading index otherwise — and play_events is the table §2.3's entire
-- denormalization argument is about: it grows without bound and local-db.ts
-- selects all of it on every dashboard load.
create index if not exists idx_play_events_org    on public.play_events(org_id);
create index if not exists idx_lineup_plans_org   on public.lineup_plans(org_id);
create index if not exists idx_tryout_signups_org on public.tryout_signups(org_id);

-- ---------------------------------------------------------------------------
-- Verification — MULTI-TENANT-PLAN §6.3 Block C.
--
-- The point is to confirm the composite FKs REPLACED the originals rather than
-- joining them. `drop constraint if exists` turns a wrong name into a silent
-- no-op, so the migration's exit code proves nothing here.
--
--   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where contype = 'f'
--      and conrelid in ('public.play_events'::regclass, 'public.games'::regclass,
--                       'public.players'::regclass, 'public.player_aliases'::regclass,
--                       'public.lineup_plans'::regclass)
--    order by 1, 2;
--
--   -- Expect 7 rows, every one of them two-column and leading with org_id:
--   --   games         1 (opponent)         players       1 (team)
--   --   play_events   2 (game, batter)     player_aliases 1 (player)
--   --   lineup_plans  2 (game, team)
--   -- and no surviving single-column *_fkey.
-- ---------------------------------------------------------------------------
