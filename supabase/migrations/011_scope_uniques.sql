-- 011_scope_uniques.sql — MT-2: global uniques become per-tenant uniques
--
-- Target: omwqwwflvnunuvgidvwx. Requires 007-010.
-- Plan: MULTI-TENANT-PLAN.md §2.4 (T1, T4), §6.1, phase MT-2.
--
-- ⚠️ RLS IN 007-013 IS INERT — see 007's header. The three constraints below,
-- by contrast, are NOT inert: a unique index is enforced by Postgres against
-- every role, including the service-role key that bypasses RLS. Along with
-- 012's composite foreign keys, these are the only genuinely load-bearing
-- isolation guarantees MT-2 ships.
--
-- RUNS BEFORE 012, and that ordering is load-bearing: 012's composite foreign
-- keys target uniques this file rebuilds, and rebuilding player_aliases' PK
-- afterwards would mean dropping and recreating a foreign key 012 had just
-- added (§6.1).
--
-- ⚠️ SERIAL WITH THE APPLICATION COMMIT that changes sbUpsert's onConflict
-- target for `games` — see section 3 below. Applying 011 without that code
-- change breaks game sync.
--
-- CONSTRAINT NAMES ARE NOT GUESSES. Every name dropped below was read out of
-- pg_constraint against the live database first, for the reason §2.3 gives:
-- `drop constraint if exists` on a wrong name is a silent no-op, and the
-- `add constraint` that follows would then fail on a duplicate name — or
-- worse, succeed and leave the global unique in place alongside the scoped
-- one. Confirmed live before writing:
--   teams_normalized_name_key   UNIQUE (normalized_name)
--   player_aliases_pkey         PRIMARY KEY (alias)
--   games_client_game_id_key    UNIQUE (client_game_id)
-- The verification block at the foot of this file re-checks that each drop
-- actually removed something.

-- ---------------------------------------------------------------------------
-- 1. T1 — teams.normalized_name
-- ---------------------------------------------------------------------------
-- The defect, restated: sync/game/route.ts:59-63 resolves an opponent with
-- `normalized_name=eq.<name>`. With a GLOBAL unique, org B scoring a game
-- against "NYO Bucks" does not collide — it silently attaches org B's game to
-- org A's team row, and both orgs' spray charts for that opponent merge into
-- one. The fix is not a check in the application; it is making the collision
-- impossible to express.
alter table public.teams drop constraint if exists teams_normalized_name_key;
alter table public.teams add constraint teams_org_normalized_name_key
  unique (org_id, normalized_name);

-- ---------------------------------------------------------------------------
-- 2. T4 — player_aliases.alias
-- ---------------------------------------------------------------------------
-- `alias` is the primary key today, so the alias string is globally unique:
-- org B cannot have a player aliased 'jack' because org A already does, and
-- the insert simply fails. Rebuild the PK as (org_id, alias).
--
-- This is the one place in MT-2 where a drop-and-recreate of a primary key
-- touches live data (14 rows). It is safe because 002_link_play_events.sql
-- already denormalized alias resolution into play_events.batter_player_id —
-- nothing reads player_aliases on the hot path except player-name-db.ts:42,
-- which fails soft by design (:76-80). Nothing has a foreign key pointing at
-- player_aliases, so no dependent constraint has to be rebuilt.
--
-- The 001 invariant still holds: alias is ALWAYS stored as lower(btrim(x)).
-- Widening the key does not relax the case-folding, which remains unenforced
-- by the schema and enforced by the writers.
alter table public.player_aliases drop constraint if exists player_aliases_pkey;
alter table public.player_aliases add constraint player_aliases_pkey
  primary key (org_id, alias);

-- ---------------------------------------------------------------------------
-- 3. games.client_game_id — beyond the plan's §2.4, and here is the argument
-- ---------------------------------------------------------------------------
-- MULTI-TENANT-PLAN §2.4 names T1 and T4 and stops. `games.client_game_id` is
-- the same class of defect and it is strictly worse than T1, so it is fixed
-- here rather than filed:
--
--   * The value is `game-${Date.now()}` (coach/page.tsx:686) — a millisecond
--     timestamp with no tenant component and no randomness. Two coaches in two
--     orgs tapping "new game" in the same millisecond is unlikely, not
--     impossible.
--   * sync/game/route.ts:81-99 upserts with `onConflict: client_game_id`. The
--     conflict is resolved BY POSTGRES, not by the application. Stage A's
--     org_id filter (§3.4) does not help: a WHERE clause has no bearing on
--     which row ON CONFLICT chooses. So on collision, org B's sync would
--     overwrite org A's game row outright — including its score and its
--     opponent_team_id.
--   * Nothing else closes it in MT-2. RLS would close it in MT-3, and 012's
--     composite FK does not (the collision is on games itself, not on a
--     reference to it).
--
-- Scoping the unique is also strictly more permissive than the constraint it
-- replaces — every row that satisfied the global unique satisfies the scoped
-- one — so it cannot reject any write that works today.
--
-- ⚠️ The corresponding application change ships with this migration: sbUpsert
-- for `games` must target `org_id,client_game_id`. PostgREST resolves an
-- onConflict list against a real unique index, so an upsert still naming the
-- dropped constraint fails with "there is no unique or exclusion constraint
-- matching the ON CONFLICT specification" and game sync hard-breaks.
alter table public.games drop constraint if exists games_client_game_id_key;
alter table public.games add constraint games_org_client_game_id_key
  unique (org_id, client_game_id);

-- ---------------------------------------------------------------------------
-- Note on the uniques deliberately NOT touched
-- ---------------------------------------------------------------------------
--   players_team_id_jersey_number_key       unique (team_id, jersey_number)
--   play_events_game_id_client_pin_id_key   unique (game_id, client_pin_id)
--
-- Both are already scoped through a column that 012's composite foreign keys
-- pin to a single org. Widening them with a redundant org_id would add an
-- index column that can never change the outcome (§2.4 makes the same point
-- about players).
--
-- ---------------------------------------------------------------------------
-- Verification — confirm each drop removed something rather than no-op'ing:
--
--   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid in ('public.teams'::regclass, 'public.games'::regclass,
--                       'public.player_aliases'::regclass)
--      and contype in ('u','p')
--    order by 1, 2;
--
--   -- Expect: teams_org_normalized_name_key UNIQUE (org_id, normalized_name)
--   --         games_org_client_game_id_key   UNIQUE (org_id, client_game_id)
--   --         player_aliases_pkey            PRIMARY KEY (org_id, alias)
--   -- and NO teams_normalized_name_key / games_client_game_id_key survivors.
-- ---------------------------------------------------------------------------
