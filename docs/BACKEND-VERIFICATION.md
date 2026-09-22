# Unified reporting and backend verification — 2026-09-22

## Result

Shared live games and historical imports now feed the same review list, dashboard, spray charts and opponent reports. Source IDs are namespaced; synced server history supersedes matching saved device history. The unsaved device scorer is a separate explicit scope, not added again to all-game totals. Original records and their write models remain intact.

Reports respect undone commands and each live game's captured revision. Walks and strikeouts contribute to batting totals without appearing as batted-ball hotspots. Recorded field zones are approximate coordinates; missing old command context is not invented. Historical and live detail links retain their respective review tools.

## Fixed during the audit

- Viewer sessions and foreign origins could reach legacy lineup/import writes. Those routes now enforce the shared-game mutation guard and coach role.
- Historical sync deleted events before a separate insert. One service-only, SECURITY INVOKER database function now updates metadata and replaces events in a transaction. Concurrent imports of one game serialize, retries preserve one game identity, and existing batter identity links survive replacement. Legacy imports still use last-completed-write wins; live scoring retains revision conflicts.
- Added historical payload validation before writing, bounded login passcodes and lookup time, signup field/type/age validation, finite session timestamps, generic database errors, and private response caching rules.
- Opponent scouting records appeared in the managed-team catalog. Catalog/create-game/roster writes now distinguish own teams; team renames also maintain normalized names.
- Restricted anonymous execution of the membership helper and browser execution of the database event-trigger function. Live-command and new historical-sync RPCs are server-only.
- Fixed the spray chart's stale API path and excluded non-contact outcomes from location summaries.
- Upgraded Next.js/eslint-config-next to 16.3.5 and refreshed vulnerable lockfile dependencies. npm audit reports zero vulnerabilities (including development dependencies) at verification time.

## Route inventory

Every protected route/method below is covered by absent, forged and expired session assertions. The database-backed suites additionally cover positive and negative flows for live games, recording grants, insights, practice, workload, roster, historical reads/sync, lineup and unified reports.

| Route | Methods |
| --- | --- |
| `/api/coach/catalog` | GET |
| `/api/coach/game/[gameId]` | GET |
| `/api/coach/games` | GET |
| `/api/coach/lineup` | GET, POST |
| `/api/coach/live/[gameId]/crew` | GET, POST, DELETE |
| `/api/coach/live/[gameId]/insights` | GET |
| `/api/coach/live/[gameId]` | GET, POST |
| `/api/coach/live` | GET, POST |
| `/api/coach/login` | POST, DELETE |
| `/api/coach/play-events` | GET |
| `/api/coach/reports` | GET |
| `/api/coach/roster` | GET, POST, PATCH |
| `/api/coach/sync/game` | POST |
| `/api/coach/training/[assignmentId]` | POST |
| `/api/coach/training` | GET, POST |
| `/api/coach/workload` | GET |
| `/api/signup` | POST |

## Evidence and reproducibility

- Production build with TypeScript checks.
- 21 pure model/pitch-rule/density/report tests; unified adapter tests cover undo, home/away perspective, missing context, device/server deduplication and terminal at-bats.
- 11 local API integration tests, each containing multiple assertions: dynamic route/method authentication matrix; viewer/origin restrictions; cross-org reads/writes; roster lifecycle; six-inning split recording; pitcher workloads and correction audit; grant expiry/revocation; practice attempts and replay; 1,102-event pagination; historical import/lineup/reports; login, invalid signup input and a valid synthetic signup saved locally.
- Separate simultaneous-recorder database race test verifies one commit, one revision conflict and idempotent retry.
- Failed historical event insertion rolls back the game's label, score and original events; assertions use only the disposable database.
- SQL privilege assertions verify the new sync RPC cannot be invoked by anon/authenticated and live grants/practice cannot be read/written directly by public clients.
- Browser checks: shared and imported games appear together; analytics navigation and heat map render; 390px phone selection of one shared and one historical game rendered the combined heat map without console errors.
- Production read-only inspection: all 15 public tables have RLS enabled; training_progress is a security-invoker view; no orphan historical events. Anonymous REST reads across all 16 tables/views returned empty or denied, never private rows.
- Production function privileges verified after the additive migration. No production game records were changed by the audit.

Run the model suites with `node --experimental-strip-types --test tests/live-model.test.mjs tests/pitch-rules.test.mjs tests/contact-density.test.mjs tests/reports.test.mjs`.
Run API suites sequentially with `node --experimental-strip-types --test --test-concurrency=1 tests/live-api.test.mjs tests/roster-api.test.mjs tests/historical-api.test.mjs tests/backend-api.test.mjs` against the local 4181 app and 54390 disposable REST proxy only. Apply tests/backend-fixture.sql after the existing review/historical fixtures. tests/backend-permissions.sql is also disposable-only.

## Remaining limits and follow-up work

This is a route-wide functional/security review, not a penetration-test certification or a proof of every input/interleaving.

1. Coach sessions still identify an organization and role through shared passcodes, not individual people. They last 30 days; legacy owner-cookie compatibility and APP_PASSCODE fallback remain. Immediate per-person revocation and organization deactivation enforcement across all paths need the real-account phase. Login and public signup do not yet have a verified distributed abuse/rate-limit policy.
2. Coach queries use the server service role with explicit organization filters and composite constraints. They do not gain row-level tenant enforcement from RLS on that connection. Migrating to per-user database authorization requires a deliberate authentication rollout.
3. Public signup still supports the existing service-role fallback when an anon key is absent. This pass checked input handling and live anonymous read denial; it did not submit a production signup or prove the deployed signup client's key selection.
4. Reports read full organization history in bounded pages. Large-league load testing and database-side season aggregation remain. The Today game list still intentionally selects the most recent 100 shared games; the new report path reads all of them.
5. Database advisors retain one intentional security warning: authenticated execution of current_org_ids, needed by tenant policies to resolve only the caller's claims/membership. Six no-policy notices are intentional server-only tables. Performance advisors identify additional foreign-key indexes, unused indexes and Auth pool sizing; no speculative indexes were dropped.
6. Backup restore/disaster recovery, external email delivery (not implemented), and long-duration real-device offline testing were not performed. Authenticated production UI testing requires the user's current passcode; authenticated mutation tests ran only locally.

Reference: [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [Next.js upgrade guidance](https://nextjs.org/docs/app/guides/upgrading/version-16).
