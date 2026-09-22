# Dugout Master product walkthrough → Ninety Feet development plan

Reviewed September 21, 2026. Demo version displayed: 1.47.1.

## Conclusion

Dugout Master's strongest experience is the connection between season planning, player history, defensive rotation, and running a practice. Ninety Feet should adopt the useful workflow patterns while retaining its own design and its two connected purposes: help kids learn baseball, and help adults run a team with trustworthy game data.

The highest-value sequence is reliable game recording first, then game-to-practice recommendations, player development history, and fair rotation planning. A broad collection of administration screens should follow those core journeys.

This was a hands-on browser walkthrough of the demo, not a source-code or backend audit. Every main navigation section was visited or its access boundary tested. Representative detail screens, alternate views, menus, and playback controls were opened. It does not mean every record, destructive action, or account-only feature was exercised. No account was created, no invitations or communications were sent, no public link was created, and no files were uploaded. A demo practice timer was started to inspect execution mode and explicitly stopped afterward.

## Coverage and evidence

| Area | What was opened or exercised | Verification limit |
|---|---|---|
| Team home | Upcoming/recent events, season snapshot, mini-calendar, Coach IQ, readiness drawer | Demo content; apparent collaborator changes are not proof of real multi-device synchronization |
| Team performance | Snapshot, leaders, metric choices, player stat table, source labels, import entry | Import is account-gated |
| Family team page | Visibility controls, preview, schedule, sharing/QR entry, announcements | Settings disabled for demo; publication not exercised |
| Coaches | Staff roles and responsibilities entry | Demo had no responsibilities to inspect |
| Seasons | Overview, rotation table, individual rotation breakdown, responsibilities | Edit Season disabled |
| Calendar | Month, week, agenda, event cards, replay entry | No scheduling write submitted |
| Games | Upcoming/past/opponents, opponent detail, showcase game | Scheduling requires account |
| Live game | Field, Players, Positions, Game Plan, lineup drawer, batting suggestions, rotation assistant, field configurations, clock, warm-up, settings, pitch counter, history, share options | No public link or real lineup edit applied; no offline synchronization test |
| Replay | Timeline, individual event selection, resulting field/inning state, playback controls | This is lineup/activity replay; did not establish pitch-by-pitch scorekeeping capability |
| Roster | Season/team/club tabs, filtering entry, import/export menu, contacts | Club roster empty; edit/import account-gated |
| Player | Overview, performance, games, playing time, development, media, actions | No upload or real two-video comparison performed |
| Practices | Upcoming/past readiness, overview, plan, equipment, field setup, menu, templates | Sample field setup page contained no configured diagram |
| Practice execution | Run, current/next drill, countdown, drill detail, stop confirmation, Coach Display, exit | Demo session stopped; timer persistence across devices not verified |
| Evaluations | Session overview, dedicated evaluator mode, item switching, progress, made/missed and undo controls | Recording disabled |
| Drills | Category filter, drill detail drawer, setup/equipment/instructions, linked diagram | Creating/editing not exercised |
| Diagrams | Library, usage links, standalone detail, step selection, playback/speed/loop controls | No diagram editing write |
| Video library | Saved videos, embedded viewer, notes entry, search/filter interface | Public drill library remained loading when checked; external search results not established |
| Tryouts | Upcoming/previous/candidates, overview, evaluation view, results, player breakdown, evaluator comparisons | Evaluation Plan explicitly denied write access; scores disabled |
| Notes | Tabs, season/filter/search controls, context-linked note navigation | No note created |
| Files | Context tabs, list, file viewer, related player link, download entry | No upload/download needed; demo video listed 0 B |
| Venues | Weather, map, directions entry, related games/practices, files | No external navigation or location permission needed |
| Global search | Searched “cutoff”; results grouped into practices, drills, diagrams | Search scope labeled current season |
| Settings/billing | Entry clicked | Explicit “This needs an account” boundary |
| Narrow screen | Field and Game Plan inspected; view selector and lineup drawer exercised | Browser viewport preview, not physical phone/iPad testing |

Primary starting points: [demo team](https://app.dugoutmaster.com/teams/dm-demo-team/home), [showcase game](https://app.dugoutmaster.com/games/dm-demo-showcase-game/1), [practices](https://app.dugoutmaster.com/practices), [drills](https://app.dugoutmaster.com/drills), [tryouts](https://app.dugoutmaster.com/tryouts), [roster](https://app.dugoutmaster.com/roster), [calendar](https://app.dugoutmaster.com/calendar).

## 1. Game-day planning and operation

### Observed

The game has one persistent context: teams, clock, current inning, and view choice. Desktop views offer a field, player-by-inning grid, position-by-inning grid, and printable Game Plan. These are different views of the same assignments. On the narrow layout, the view selector offered Field and Game Plan; the player strip scrolled horizontally and inning navigation stayed near the bottom.

The lineup drawer separates available players from the batting list and exposes drag handles. Suggested batting orders offer Balanced, Maximize runs, and Spread the at-bats. In this sample, it explicitly reported insufficient batting data rather than producing a recommendation.

Rotation Assistant presents individual swaps with explanations and a separate apply action. Game Settings expose pitcher/catcher eligibility, position exclusions, a pitch maximum, field-role markers, and a PIN lock entry for handing the device to a player. Field configurations include standard defense, additional outfielders, extra hitter, rover, and larger youth configurations.

The pitch counter is a focused drawer with current total/maximum and minus-one, plus-one, plus-five controls. History groups related changes and identifies the person and time. Completed-game replay can select an event and reconstruct the displayed inning and field assignment. Warm-up drills and equipment are attached to the game.

Share Lineup exposes image/text/PDF options and batting-only versus full-game previews. Share Game explains that a public link exposes lineup and status without an account; creating that link was not attempted.

### Apply to Ninety Feet

- Keep the coach planner, parent pitch recorder, parent play recorder, and fence-mounted display as explicit modes over one game.
- Give the fence display large names, current/next inning, batting queue, pitcher count, and a clear last-update indicator. It should not inherit the entire coach toolbar.
- Keep parent actions large and focused. A parent recording a ball to left field should not navigate a season rotation table.
- Offer an inning matrix as the planning companion to our existing shared field component.
- Recommend rotation changes with the reason, eligibility constraints, and before/after preview. Require a coach to apply them.
- Separate planned innings from innings actually played. Playing-time reports must use actual participation and explain missing data.
- Show corrections as durable events with actor, reason, before/after state, and effects on other devices.
- Use a reversible preview for undo. Do not silently replay a stale queued correction after another device changes the game.

### Cautions from the walkthrough

The narrow field view required internal scrolling, and the wide Game Plan grid clipped names and columns. Ninety Feet should test a whole-field fence view separately from a compact phone recorder. The demo's automated collaborator toast demonstrates a presentation pattern, not verified concurrency behavior. Its replay should not be described as full scorebook reconstruction based on what was observed.

## 2. Practice planning and execution

### Observed

Practice cards show readiness states such as needs a time, needs drills, and ready. A practice is organized into overview, plan, equipment, and field setup. The overview compares scheduled time with planned time and counts stations and activities. Blocks can group several drills into a station.

Run Practice switches to current drill, countdown, next up, timeline, previous/skip/stop controls, and alerts. Opening drill details retains the timer and exposes extra-minute controls. Coach Display removes most navigation for a large display. Templates reuse the same practice structure. Equipment is aggregated from the selected drills and labeled by source.

### Apply to Ninety Feet

Build the complete chain: game observation → recommended focus → coach-selected drill → saved practice → station assignment → run practice → player result. Each recommendation should link to the actual observation and show sample size.

A coach should be able to choose a duration, available coaches, space, and equipment. The planner should explain a duration mismatch before starting. Equipment aggregation needs a sensible quantity policy: simultaneously running stations may require summed equipment; sequential drills often reuse the same gear.

A practice execution screen should survive phone lock/reload, make its timer state obvious, and allow a coach to skip or extend a block without losing evaluations. Provide a printable fallback and a dedicated display view.

## 3. Training content and kids' learning

### Observed

Drills have category filters, duration, player counts, setup instructions, equipment, execution steps, and resources. One cutoff drill opened an interactive five-step field diagram with captions, thumbnails, previous/next, playback, speed, and looping. The diagram library tracks where diagrams are used. Saved external videos can have contextual notes, while video discovery offers age and duration filters.

### Apply to Ninety Feet

Our existing interactive baseball field can become a shared teaching surface: show the situation, ask the child where to move or throw, then reveal the next step with a short explanation. Keep coach setup and child interaction distinct.

Use original diagrams and original explanations. Reuse the underlying Ninety Feet field component across games, coach plans, and lessons, with age-appropriate controls. Store the skill being taught, difficulty, expected answer, explanation, and linked practice drill so performance can inform coaching.

Avoid making a giant video catalog the primary learning journey. Lead with a short skill task and its next practice step. Video can support that task.

## 4. Player development and analytics

### Observed

Player pages combine overview, performance, games, playing time, development, and media. Stats include definitions, denominators, trends, comparison controls, and source/update context. Development includes measurable categories, evaluation history, tags, achievements, and coaching notes. Playing-time views show position exposure by game and season. Team performance explicitly says its stats come from imported GameChanger data.

Season rotation provides playing-time and position-balance labels, individual breakdowns, and untried positions. A suggested batting order refused to calculate with insufficient data. These are useful examples of exposing the evidence behind a recommendation.

Some demo screens had inconsistent counts or empty states despite populated related pages. That is a reason to validate our own cross-screen totals, not enough evidence to diagnose their production system.

### Apply to Ninety Feet

Give each player a development timeline with three primary questions: what improved, what needs work, and what to practice next. Include game observations, training attempts, coach evaluations, and actual position/pitch workload.

Every insight needs its source, timeframe, sample size, and supporting records. Distinguish imported cumulative snapshots from per-game events; never sum cumulative imports. Use stable player identities across seasons and surface ambiguous mappings during import.

For younger players, emphasize progress and opportunity rather than an unexplained public ranking. Coach-facing rankings and family-facing progress should be different presentations with appropriate access.

## 5. Evaluations and tryouts

### Observed

Practice evaluation mode removes normal navigation and shows the active item, next player, completion progress, and quick recording controls. The sample used made/missed attempts. Tryouts support different rating types: pass/fail, qualitative choices, stars, numeric measurements, and competitions. Results expose evaluator completion, combined or individual coach scores, sorting/filtering, and item-level details. Candidate records retain their source tryout.

### Apply to Ninety Feet

Use the same evaluation model for ordinary player development before building a large recruiting system. A drill result should retain measurement type, units, attempts, evaluator, date, and context. Missing evaluations should remain missing, not become zero. Compare like measures and comparable conditions.

A later tryout workflow can add registration, check-in, station assignments, independent evaluator scoring, completion review, and roster decisions. Keep recruiting data private and avoid automatically making selection decisions.

## 6. Team administration and family experience

### Observed

Team home combines games, practices, tryouts, reminders, and season context. Readiness distinguishes required setup from recommended setup. Calendar offers month/week/agenda. Contacts link guardians to players. Public team-page controls distinguish unlisted/public visibility and explicitly keep internal game details private. Notes and files are grouped by their related entity. Venues link logistics, weather, maps, files, and scheduled events. Global search finds multiple content types in one place.

### Apply to Ninety Feet

- Add a short first-use readiness flow: team, roster, game, lineup, recorder assignments, display check.
- Provide a single family entry point for next event, arrival/location, child's assignment, and training task.
- Keep scheduling and messages connected to the event; show whether an announcement is just saved or actually sent.
- Offer private staff notes with explicit scope and link them to the relevant player/game/practice.
- Add search after enough content exists to justify it, with role-aware results.
- Maintain season history without duplicating the player's identity.

## 7. GameChanger reference and limits

GameChanger's official [offline scorekeeping guidance](https://help.gc.com/hc/en-us/articles/360030864752-Offline-Scorekeeping) describes signing in while online and later syncing recorded activity. Its [web stats editing announcement](https://gc.com/post/game-stats-and-stat-editing-available-on-web) describes staff access to game stats and editing. These were documentation references, not a hands-on audit of its full app.

The relevant lesson is confidence in recording and correction. Ninety Feet should visibly distinguish saved on server, waiting to upload on this device, reconnecting, and conflict needing review. A shared board must show confirmed state. Do not imply that offline reload, multiple offline writers, or cross-device synchronization is supported until each is tested.

## Prioritized Ninety Feet backlog

| Priority | Deliverable | Acceptance criteria |
|---|---|---|
| P0 | Role-specific parent onboarding | Shared link survives sign-in and opens the assigned lane; parent sees concise instructions; unauthorized controls are rejected server-side |
| P0 | Connection recovery | Pending commands survive refresh; retries cannot duplicate events; reconnect is visible; stale revisions require review; display never presents unsaved state as shared |
| P0 | Pitch workload | Coach-configured league rule values; same-day totals and rest window; missing history clearly labeled; current pitcher warning; no universal rulebook assumed |
| P0 | Coach corrections | Preview and reason; durable audit; synchronized result; meaningful undo; historical-stat limitations explicit |
| P1 | Pregame readiness and lineup planning | Attendance, order, position eligibility, inning matrix, bench balance, assigned parent crew, display check |
| P1 | Practice execution | Saved plan, stations, planned/scheduled duration, equipment checklist, timer, next drill, restart recovery, printable view |
| P1 | Player development loop | Game/training/evaluation evidence leads to a coach-approved focus and practice; visible source and sample size |
| P1 | Family home | Next event, location/arrival, assigned role, child's training task, scoped access |
| P2 | Explainable rotation recommendations | Uses actual participation and position constraints; gives reason and preview; coach applies individual changes |
| P2 | Reusable teaching diagrams | Original step sequences on the shared field; child practice question; explain answer; results linked to skill |
| P2 | Stats import | Preview, player mapping, source/timeframe, cumulative-vs-event distinction, duplicate protection, rollback |
| P2 | Evaluations | Units/attempts, per-coach scores, completion, historical comparison without treating missing values as zero |
| P3 | Tryouts, club tools, advanced media | Build after core team and development flows prove useful; validate demand and access requirements |

## Current implementation boundary

The first four P0 areas have local work on `codex/game-day-reliability`. At the time of this research report, unit/API checks and a build had passed, but browser verification and release were still pending. Research findings do not imply that later backlog items have been implemented.

Before release, finish role-link sign-in testing, offline/reconnect tests, correction conflict tests, pitch-rule UI review, and phone/iPad display checks. Then create a reviewable PR and preview, reconcile concurrent OpenClaw changes, and deploy through the existing authorized release workflow.
