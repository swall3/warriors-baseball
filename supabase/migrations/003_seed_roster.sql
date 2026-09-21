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
-- PENDING STUART CONFIRMATION — do not uncomment/apply until confirmed;
-- see MERGE-PLAN.md open item.
-- ===========================================================================
--
-- The three drift spellings below are the entire reason Phase 2 exists, and
-- they are the only alias rows that assert two different strings are the same
-- child. That assertion cannot be derived from the data — it is a fact about
-- real kids on a real roster, and only Stuart can supply it.
--
-- MERGE-PLAN.md §0.5 states this was already confirmed. Treat that line as
-- UNVERIFIED: it was written by an earlier agent and the confirmation behind it
-- has not been established. The live question is open and is being put to
-- Stuart directly. Do not apply these rows on the strength of §0.5.
--
-- Until they are applied, the system degrades safely rather than incorrectly:
-- 002 makes batter_player_id nullable, so a play logged as 'Jackson' still
-- records in full; it simply does not aggregate under Jack. Guessing wrong in
-- the other direction would merge two children's statistics into one row,
-- which is both harder to detect and harder to undo.
--
-- Each line needs an independent yes — they are three separate questions, not
-- one. Apply only the pairs actually confirmed.
--
-- insert into public.player_aliases (alias, player_id) values
--   ('jackson','plr-jack'),      -- PENDING: is Jackson the same kid as Jack?
--   ('linc','plr-lincoln'),      -- PENDING: is Linc the same kid as Lincoln?
--   ('aidan','plr-aiden')        -- PENDING: is Aidan the same kid as Aiden?
-- on conflict (alias) do nothing;
--
-- If any pair is NOT the same kid, that spelling is a separate player: add a
-- row to public.players for them instead, then alias their own name to it.
--
-- After applying any of the above, re-run the 005 backfill — it is written to
-- be re-runnable and only touches rows still holding a null batter_player_id.
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
