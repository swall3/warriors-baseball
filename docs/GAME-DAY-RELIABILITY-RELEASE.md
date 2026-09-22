# Game-day reliability and connected practice

## Delivered
- Recorder assignment instructions and expiration survive sign-in; parent devices see their assigned recording lane.
- Visible shared-save status, reconnect, durable pending commands, and reviewed queue discard.
- Coach corrections preview count, score, bases and pitcher totals, require a reason, appear on the dugout display and in review, and support reviewed undo.
- Per-game league pitch limits, warnings and rest thresholds; organization-scoped recorded workload informs preparation and live scoring.
- Pregame ready check validates lineup/defense and summarizes rules and device setup.
- Practice sessions run existing assigned field questions with pause/resume, persistent timing, player progress and source-game links.

## Verification (2026-09-21)
- Production build and TypeScript passed.
- 14 model/pitch-rule tests and 4 API/concurrency tests passed against an isolated local database.
- Browser: pitch entered during database connection loss survived reload and synced once after recovery.
- Browser: reviewed score correction appeared on a separate dugout board; reviewed undo restored the prior score.
- Browser: recorder link survived login on a separate origin and exposed only the assigned pitch lane.
- Browser: practice timer survived reload, pause, activity navigation and return; finish confirmation worked.
- Browser: pregame rule configuration and readiness summary worked; phone layout checked at 390px and viewport reset afterward.
- OpenClaw confirmed MT-3 is included and no newer unpushed changes or overlapping work exist.

## Boundaries
Pitch reminders depend on the configured league rules and shared kid-pitch games recorded here. Outside/imported games, other player identities, catcher restrictions and exceptions require coach confirmation. Warnings do not prohibit scoring.

Connection recovery preserves pending commands; this is not a full offline cold-start application. Coach corrections adjust current state and preserve an audit reason; they do not rewrite historical hit/error rulings.

The timer is device-local; assignments and answers are shared. This release runs existing digital field-question activities, not a full on-field station/equipment planner. Club administration, tryouts, broader imports, advanced video and richer development history remain in the research backlog.
