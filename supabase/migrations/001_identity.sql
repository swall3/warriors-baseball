-- 001_identity.sql — Phase 2: player identity tables
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app) — the single project shared
-- by the Warriors public site and the /coach tool. See MERGE-PLAN.md §3.1.
--
-- ⚠️ NOT YET APPLIED. Written per MERGE-PLAN.md §2.1; nothing in 001–003 or the
-- 005 backfill reference has been run against the live database.
--
-- Why these tables exist (MERGE-PLAN.md §0.3, bugs B2–B6): the app currently
-- identifies a hitter by the raw text a coach typed. 14 distinct batter strings
-- exist for 11 kids, so "Jack" and "Jackson" aggregate as two different
-- players. `players` gives each kid one stable id; `player_aliases` maps every
-- string ever typed onto that id.
--
-- Provenance is preserved: `play_events.batter` (the raw string) is never
-- dropped or rewritten. See 002.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Canonical roster. One row per kid.
-- ---------------------------------------------------------------------------
-- Column definitions are verbatim from MERGE-PLAN.md §2.1.
--
-- `id` is text, not uuid, to match the text-PK convention the existing
-- teams/games/play_events chain already uses in this project.
--
-- `jersey_number` is text on purpose: '#00' and '0' are different jerseys, and
-- an integer column silently collapses them.
create table if not exists public.players (
  id             text primary key,          -- 'plr-jack', app-generated
  team_id        text not null references public.teams(id) on delete restrict,
  display_name   text not null,             -- canonical: 'Jack'
  first_name     text,
  last_name      text,
  jersey_number  text,                      -- text: '#00' ≠ 0
  bats           text check (bats in ('L','R','S')),
  throws         text check (throws in ('L','R')),
  birth_year     integer,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (team_id, jersey_number)
);

-- ---------------------------------------------------------------------------
-- Every spelling that resolves to a player.
-- ---------------------------------------------------------------------------
-- `alias` is the primary key, so one string can never point at two kids — the
-- ambiguity that would make aggregation non-deterministic is structurally
-- impossible rather than merely discouraged.
--
-- ⚠️ INVARIANT: `alias` is ALWAYS stored as lower(btrim(x)). Nothing in the
-- schema enforces the case-folding, and the §2.4 backfill matches with
-- `lower(btrim(e.batter)) = a.alias` — a mixed-case row inserted by hand would
-- simply never match anything. Insert through the seed migration or the app,
-- not ad hoc.
create table if not exists public.player_aliases (
  alias      text primary key,              -- ALWAYS lower(btrim(x))
  player_id  text not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_player_aliases_player on public.player_aliases(player_id);
create index if not exists idx_players_team          on public.players(team_id);

-- RLS on, matching every other table in this project (MERGE-PLAN.md §3.3).
-- The service-role key used by /api/coach/* bypasses RLS; a leaked anon key
-- yields nothing because no policy grants it anything.
--
-- Note for Phase 5 (MERGE-PLAN.md §6): the public /roster page will need an
-- explicit select policy over `players` limited to active=true and to
-- non-contact columns. Do not add it here — Phase 2 has no public reader.
alter table public.players        enable row level security;
alter table public.player_aliases enable row level security;

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from public.players;         -- expect 0 until 003
--   select count(*) from public.player_aliases;  -- expect 0 until 003
-- ---------------------------------------------------------------------------
