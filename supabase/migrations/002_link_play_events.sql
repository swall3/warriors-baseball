-- 002_link_play_events.sql — Phase 2: wire play events to identities
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app). Requires 001.
--
-- ⚠️ NOT YET APPLIED. Written per MERGE-PLAN.md §2.2.
--
-- `play_events.batter` (text) stays exactly as-is — this migration adds a
-- parallel identity column, it does not replace or rewrite the raw string.
-- That is the provenance guarantee from §2.1: whatever the coach actually
-- typed remains readable forever.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

alter table public.play_events
  add column if not exists batter_player_id text references public.players(id) on delete set null;

create index if not exists idx_play_events_batter_player on public.play_events(batter_player_id);

-- ---------------------------------------------------------------------------
-- Why nullable, and why `on delete set null`
-- ---------------------------------------------------------------------------
-- An unrecognized name still records the play; it just doesn't aggregate until
-- an alias is added. This is the whole point (MERGE-PLAN.md §2.2): never lose a
-- plate appearance to a typo. A `not null` column here would force the live
-- scoring screen to reject a mid-game name it has never seen — during an actual
-- game, which §7.4 says must never regress.
--
-- Opponent batters stay unlinked by design. They are scouting data, not roster
-- members, so every opponent row keeps batter_player_id null permanently.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from public.play_events;                              -- expect 119
--   select count(*) from public.play_events where batter_player_id is null; -- expect 119 until the 005 backfill
-- ---------------------------------------------------------------------------
