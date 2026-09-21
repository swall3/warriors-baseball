-- 003_seed_roster.sql — Phase 2: seed the 11-player roster and its aliases
--
-- Target: omwqwwflvnunuvgidvwx (Outlaws-field0app). Requires 001.
--
-- ⚠️ NOT YET APPLIED. Written per MERGE-PLAN.md §2.3.
--
-- Idempotent and forward-only (MERGE-PLAN.md §7.6): safe to re-run.

-- ---------------------------------------------------------------------------
-- Our own team row — must exist before any player FK can resolve.
-- ---------------------------------------------------------------------------
-- `public.teams` shipped holding ONLY opponent teams (`team-nyo-bucks`,
-- `team-oregon-park-wahoos`). There was no row for our own team, so the
-- `players.team_id -> teams(id)` FK below would fail on a clean database.
--
-- 004_lineup_plans.sql already contains this same insert, because it landed
-- before 001–003 existed and `lineup_plans.team_id` is `not null references
-- public.teams(id)`. It has been applied to the live database, so on the live
-- database this statement is a no-op. It is repeated here — not moved out of
-- 004 — so that a fresh database can be built by running 001..004 in numeric
-- order without an FK failure at 003. Both copies are `on conflict do nothing`;
-- running them in either order is safe.
--
-- Bare `on conflict do nothing`, not `on conflict (id)`: `normalized_name` is
-- also `not null unique`, so a pre-existing row named 'outlaws' under some
-- other id would raise on the narrower form.
insert into public.teams (id, name, normalized_name)
values ('team-outlaws', 'Outlaws', 'outlaws')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The roster — 11 kids.
-- ---------------------------------------------------------------------------
-- Names verbatim from MERGE-PLAN.md §2.3.
--
-- `jersey_number` is deliberately left NULL. §2.3 lists the numbers from
-- DEFAULT_OUTLAWS_LINEUP (#00 #3 #6 #11 #15 #18 #20 #22 #31 #41 #99) but also
-- states the assignment "must be confirmed by Stuart, since the numbers and
-- names were never correlated in the source (that is B5)". MERGE-PLAN.md §9
-- item 4 is still open. Guessing the mapping here would bake an unverified
-- correlation into the primary roster table, and `unique (team_id,
-- jersey_number)` would then make it awkward to correct. NULL is honest and
-- updatable; fill it in with a follow-up migration once §9.4 is answered.
insert into public.players (id, team_id, display_name) values
  ('plr-jack','team-outlaws','Jack'),       ('plr-lincoln','team-outlaws','Lincoln'),
  ('plr-aiden','team-outlaws','Aiden'),     ('plr-caden','team-outlaws','Caden'),
  ('plr-corey','team-outlaws','Corey'),     ('plr-felix','team-outlaws','Felix'),
  ('plr-foster','team-outlaws','Foster'),   ('plr-kellen','team-outlaws','Kellen'),
  ('plr-levi','team-outlaws','Levi'),       ('plr-phoenix','team-outlaws','Phoenix'),
  ('plr-ryan','team-outlaws','Ryan')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Aliases — UNDISPUTED ONLY.
-- ---------------------------------------------------------------------------
-- Every alias below is a player's own canonical name lower-cased. These carry
-- no identity judgement at all: they assert only that the string 'jack'
-- resolves to the player displayed as 'Jack'. Safe to apply as-is.
--
-- Remember the 001 invariant: alias values are ALWAYS lower(btrim(x)).
insert into public.player_aliases (alias, player_id) values
  ('jack','plr-jack'),
  ('lincoln','plr-lincoln'),
  ('aiden','plr-aiden'),
  ('caden','plr-caden'),
  ('corey','plr-corey'),
  ('felix','plr-felix'),
  ('foster','plr-foster'),
  ('kellen','plr-kellen'),
  ('levi','plr-levi'),
  ('phoenix','plr-phoenix'),
  ('ryan','plr-ryan')
on conflict (alias) do nothing;

-- ===========================================================================
-- CONFIRMED 2026-09-21 — Stuart confirmed directly, in this conversation:
-- "your assumption is coorects these names should be merged". All three pairs
-- are the same kid each. See memory/warriors-name-alias-confirmation.md.
-- ===========================================================================
insert into public.player_aliases (alias, player_id) values
  ('jackson','plr-jack'),
  ('linc','plr-lincoln'),
  ('aidan','plr-aiden')
on conflict (alias) do nothing;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Verification (run manually after applying):
--
--   select count(*) from public.players;         -- expect 11
--   select count(*) from public.player_aliases;  -- expect 11 now, 14 once the
--                                                -- three pending pairs land
--
-- MERGE-PLAN.md §3.4 lists `player_aliases=14` in its checklist. That target is
-- only reachable after the pending block above is confirmed and applied.
-- ---------------------------------------------------------------------------
