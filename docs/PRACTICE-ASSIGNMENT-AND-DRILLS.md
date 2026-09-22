# Work order: position-based practice assignment + practice/drill library

Status: **product decisions made 2026-09-22 (Stuart) — not yet implemented.**
Companion to `DUGOUT-MASTER-DEEP-DIVE.md` (which stays the detailed reference)
and `SEATS-AND-GAME-ACCESS.md` (games/drills content is paid-tier per that doc's
Decision 2; the same entitlement applies here).

## Decision 1 — Assign position practice, not individual scenarios

Coach pain point: today `assignPractice` (`src/lib/coach/live/training-store.ts`)
assigns one `scenarioId` from `BACKUP_SCENARIOS` to one player. Assigning
scenario-by-scenario per kid is too granular.

- The assignable unit becomes a **position practice** — e.g. "second base
  defense" — which bundles all relevant scenarios/drills for that position (and
  optionally a skill focus). Assign it to a player in one action; the player
  works through the bundle.
- Keep per-scenario results underneath (they feed the postgame-insights loop and
  the deep dive's evaluation model); the coach-facing assignment, progress, and
  completion views roll up to the position-practice level.
- Existing single-scenario assignments in `training_assignments` should migrate
  or coexist — don't strand current data; a position practice can be modeled as
  an ordered set of scenario IDs so the answer/result path stays unchanged.
- Recommendation surfaces (postgame insights → practice) should suggest position
  practices, falling back to scenarios only inside the bundle detail.

## Decision 2 — Practice/drill library like Dugout Master

Stuart wants the Dugout Master-style item: **preloaded practices/drills plus
custom team practices**.

- **Preloaded library:** InningWise ships a starter library of drills and
  practice-plan templates (original content and diagrams only — deep dive is
  explicit: no copying Dugout Master's drills/diagrams; adopt the workflow
  patterns, not the material). Organize by category/position/age band.
- **Custom team practices:** coaches build their own practice plans — pick
  drills (preloaded or team-created), group them into stations/blocks, set
  durations and equipment — and save them as reusable team templates. Follows
  the deep dive's P1 scope: saved plan, stations, planned vs scheduled duration,
  equipment checklist, timer/run mode, restart recovery, printable view.
- **The chain to build toward** (deep dive's highest-value sequence): game
  observation → recommended focus → coach-selected drill → saved practice →
  station assignment → run practice → player result, with each recommendation
  linked to the observation and its sample size.
- Position practices from Decision 1 are the bridge: a position practice is
  itself library content (preloaded ones ship with the app; coaches can clone
  and customize per team).
- Access: team-created content is org/team-scoped under the #14 roles model
  (head/assistant coaches edit; parents/players consume assignments). Preloaded
  library is part of the paid product; the public site's free game sample
  (SEATS-AND-GAME-ACCESS.md) does not include the drill library.

## Sequencing suggestion

Decision 1 is small and relieves a live coaching pain — it can ship
independently and quickly. Decision 2 is a real feature phase; plan it against
the deep dive's P1 priorities rather than building ad hoc.
