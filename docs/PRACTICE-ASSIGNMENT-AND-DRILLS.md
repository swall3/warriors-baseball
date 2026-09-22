# Work order: position-based practice assignment + practice/drill library

Status: **all five decisions IMPLEMENTED and merged 2026-09-22** (D1 PR #15, D2 PR #21, D3/D4 PR #22, D5 PR #19). Remaining follow-ups: run-practice timer mode, team-authored custom drills, insights→drill suggestions chain.
Companion to `DUGOUT-MASTER-DEEP-DIVE.md` (which stays the detailed reference)
and `SEATS-AND-GAME-ACCESS.md` (games/drills content is paid-tier per that doc's
Decision 2; the same entitlement applies here).

## Decision 1 — Assign position practice, not individual scenarios

**Implemented 2026-09-22** (PR #15: 9 position bundles, migration 20260922150000).

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

**Implemented (MVP) 2026-09-22** (PR #21: 37 drills, 8 templates, custom team plans at /coach/practice; timer mode + custom drills deferred).

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

## Decision 3 — Scenario content expansion (Stuart, 2026-09-22 evening)

**Implemented 2026-09-22** (catalog now 128 scenarios with a `category` field;
`src/lib/gameData.ts`, `src/lib/practice/bundles.ts`).

The current catalog (~41 backup situations) is too narrow. Expand to cover, for
every position and common game situation:

- **Who covers** (base coverage responsibilities — e.g. who covers 2B on a steal
  with a RH batter)
- **Who backs up** (existing category, keep growing it)
- **Who to throw to** (relay/cutoff targets and priority decisions)
- **What happens when we miss** (ball gets past a fielder / overthrow — where
  does everyone rotate, who chases, who covers the vacated base)

Content quality bar: every scenario must be verifiably correct youth-baseball
fundamentals (standard rec/travel-ball teaching, not MLB-specific tactics),
original wording, age-appropriate (8U–12U), with an explanation that teaches
the *why*. Scenario types get a `category` so bundles/quizzes can mix or filter
by skill (cover / backup / relay / miss-recovery).

## Decision 4 — Quiz session size + kid streaks (Stuart, 2026-09-22 evening)

**Implemented 2026-09-22** (`QUIZ_SESSION_SIZE = 12` in
`src/lib/practice/sessions.ts`; applied to the rules/backup/position games and
the position-bundle flow, with session counts, per-skill progress and
correct-answer streaks on the device).

- A quiz/practice session presented to a kid is **capped at 10–15 questions**
  (pick one number and make it config). A larger bundle spans multiple
  sessions with progress carried over — never dump 41 questions on a kid.
- Show kids their **streaks and progress**: daily-play streak already exists;
  extend the same streak/progress affordances to quiz sessions and bundles
  (per-skill progress, session completion, correct-answer streaks). Keep it
  encouraging — no public leaderboards of failures.

## Decision 5 — Multi-kid parents (Stuart, 2026-09-22 evening)

**Implemented 2026-09-22** (PR #19: schema was already many-to-many; fixed same-team second-kid invite revocation bug, added kid switcher).

A parent may have **multiple kids on the same team or on different teams**
(possibly different orgs). The #14 accounts model (TEAM-ACCESS.md linked
parents) must support one verified parent account linked to N players across
teams, with a kid switcher in the family/player views. Invitations must not
assume one-parent-one-player.

## Sequencing suggestion

Decision 1 is small and relieves a live coaching pain — it can ship
independently and quickly. Decision 2 is a real feature phase; plan it against
the deep dive's P1 priorities rather than building ad hoc.
