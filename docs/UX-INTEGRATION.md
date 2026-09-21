# Warriors / Ninety Feet integration handoff

## Result and boundaries

Ninety Feet is integrated into the existing Warriors Next.js app on local branch `codex/ninety-feet-ux`, based on MT-3 `b2bcac0`. This is a reviewable implementation, not a production deployment. The isolated WSL checkout is `/home/swall/codex-work/ninety-feet-ux`. OpenClaw's main and merge checkouts remain separate and still pointed to `b2bcac0` at final read-only inspection.

Today, Team, game preparation, shared scoring, a read-only dugout display, postgame insights and persisted player practice now use the existing application's organization, team and roster data. Device-only scoring, historical analytics, imports, rotation planning, public training and MT-3 sessions remain available.

No production data writes, migrations, push, merge or deployment occurred. OpenClaw agents were not interrupted. Its recorded MT-3 implementation succeeded; a separate verify/deploy task failed for an authentication-routing reason. The Vercel connector returned 403 for the project scope, so the deployed commit remains unverified.

## Connected behavior

- Prepare from the signed-in organization's actual roster, reorder batting, assign nine/ten positions, choose home/away and kid/coach pitch, and save. Prepare another game while one is active.
- Score on one phone or assign separate pitch/play recorders. In-play increments the active pitcher's total once. Its result references that pitch and resolves every runner.
- Display confirmed positions, batting order, bench, next batter, score and pitcher total on a fence iPad. The board cannot record and warns when updates stop.
- Change pitchers while retaining totals, substitute bench players, schedule next-inning defense, advance a half inning for time/run limits, undo the latest action, and finish/reopen through the coach's correction control.
- Persist commands locally before sending. Retry the same ID. Stale revisions stop for review rather than silently rebasing. Pending actions are readable baseball descriptions. Discard fetches the current game before clearing the queue.
- Web Locks allow one queue writer per role/game in a browser. Another tab is read-only and acquires ownership when the previous tab leaves. Separate grants/devices remain independent. Old asynchronous responses cannot change a newly selected game's queue.
- Review pitch totals and opponent contact locations, then assign an existing practice scenario. Server-side answer evaluation and idempotent attempts persist progress. Undo excludes that play from contact analysis; old receipts without context are explicitly excluded.

## Data and permissions

The signed session's organization is the only tenant authority. Server queries include it; composite foreign keys bind teams, games, players and practice within an organization.

The existing server-only service-role client is retained. New tables enable RLS and deny direct anon/authenticated access. Server authorization and scoped queries remain critical: service-role traffic is not per-user RLS enforcement. The service-only command RPC atomically stores receipt and aggregate under a short row lock.

Recorder grants are scoped to one organization/game, expire after 18 hours, and are revocable. Only a hash is stored. The link secret is a URL fragment retained in that tab's session storage. Grants require a same-organization session and identify an assigned device/role, not a verified person. Use viewer sessions for parent recorders; coaches retain their broader session privileges outside granted views.

Training is adult-assisted under the shared organization session, not individual child authentication. An adult confirms the selected player. Existing activities use nine-position fields and are labeled accordingly.

## Verification

| Area | Evidence |
| --- | --- |
| Model | Ten tests passed: pitch counts, split recording, roles, pitcher changes, scheduled defense, runner collisions/third outs, undo, finalization and coach-pitch behavior. |
| Database | Both migrations applied from scratch in isolated PostgreSQL 16. Assertions passed for receipts, stale revisions, actor/payload mismatch, tenants, grants, RLS, security-invoker progress, attempt counts and cross-tenant foreign-key rejection. |
| Concurrency | Two simultaneous real Postgres commands yielded one commit and one conflict. Retrying the winner returned its receipt. |
| API lifecycle | Passed owner/viewer/other-tenant access, origin rejection, recorder roles, duplicates/ID reuse, concurrent submissions, revocation, corrections, finalization, insights, assignments, answer checking and attempt retry. |
| Offline queue | Stopped local REST proxy, recorded two pitches, reloaded and restored both queued actions, then reconnected. DB confirmed revision 6 and four pitches: each queued pitch counted once. |
| Browser roles | Separate pitch/play tabs completed an LF double without another pitch. A duplicate-role tab was read-only, then acquired ownership when the first left. Board received confirmed count. |
| Browser conflict | Simultaneous coach/parent clicks produced one accepted pitch and one conflict. Reviewing `Pitch: ball` and discarding the duplicate resumed at seven pitches. |
| Game to practice | Finalized synthetic game, reviewed real pitch/contact data, assigned LF-gap relay to Gray, answered SS on phone and received saved-success feedback. Earlier wrong/correct answers also verified persisted counts. |
| Responsive | Inspected 390x844 phone scoring/play/practice, 1024x768 landscape and 768x1024 portrait boards, and 1440x900 desktop review. Phone pitch buttons fit first screen; landscape board fits without page scrolling. |
| Build/regression | Production build and TypeScript passed. API lifecycle passed again against `next start`. Built Today, phone preparation and saved practice loaded; lesson focus moved to its question at scroll position zero. Fresh public training loaded with no console errors. Legacy scorer rendered, but reported React hydration error 418; its page source is unchanged from MT-3. |

Browser findings led to compact phone headers, a board-height adjustment, readable action review, safe tab ownership transfer, non-overlapping polling, and focus/scroll reset to the practice question.

## Migrations and local review

New migrations, in order:
1. `supabase/migrations/20260921192619_live_game_commands.sql`
2. `supabase/migrations/20260921195625_live_training_and_event_context.sql`

They add separate live-game aggregates/receipts/grants and training assignments/attempts/progress. They do not replace historical games. Verify baseline migrations 001–015 and review staging before any production application. Production migration/deployment is a separate authorized step.

Local review: `http://localhost:4180/coach/today`, passcode `local-review-coach`. All local data and credentials are synthetic. The ignored `.env.local` is excluded from the branch/bundle.

Local infrastructure: `codex-ninety-feet-db-tests` Postgres container; `codex-ninety-feet-rest` PostgREST on localhost:54389; `scripts/local-review-proxy.mjs` on localhost:54390; app on 4180. A separate network-isolated container verified fresh migrations.

```sh
node --experimental-strip-types --test tests/live-model.test.mjs
node --test tests/live-concurrency.test.mjs
node --experimental-strip-types --test tests/live-api.test.mjs
npx tsc --noEmit
npm run build
```

API tests refuse a non-local Supabase URL; concurrency targets the named disposable container. SQL verification runs `live-database.sql`, `review-fixture.sql`, the second migration, then `training-database.sql` on a fresh database. Never run these fixtures against an existing/production database: they create test roles/base tables and fictional rows.

## Limits and rollout checks

- Polling is every three seconds. Separate tabs verify shared backend behavior; physical phones/iPads and sunlight usability still need a field trial.
- Offline durability covers already loaded game state and browser-stored commands. This is not an offline PWA: fresh launch without application assets/server is unsupported. Do not clear storage with unconfirmed actions. Training retries are tab-local, not a durable offline queue.
- No league pitch/rest limits or eligibility rules are configured. Kid pitch uses four balls/three strikes. Coach pitch counts are informational with explicit walk/strikeout decisions under league rules. Not every special baseball scoring rule is implemented.
- New game insights remain separate from historical imports/analytics. Old receipts lacking event context cannot provide trustworthy contact statistics.
- Existing shared-passcode identity and legacy API behavior were preserved. This is not an application-wide security audit or individual parent/child account system.
- Existing Next.js middleware-convention and metadataBase warnings remain. No dependency upgrades were included.
- Legacy `/coach` reports a hydration mismatch in the production preview while still rendering. Its unchanged implementation initializes state from browser storage during render, which is a likely cause; this was not proven with a separate baseline build. New practice and public training checks had no console errors. Track the legacy warning before calling application-wide regression clean.
- Before rollout: verify deployed revision, review/apply migrations in staging, trial actual devices and verified league rules, approve production rollout, then re-check deployed authenticated flows.

## Review artifacts

The incremental Git bundle contains `codex/ninety-feet-ux` and requires base `b2bcac0` from the Warriors repository. Verify with `git bundle verify` and fetch into a separate clone. The patch is the full diff against that base. Neither contains the ignored local environment. Keep OpenClaw's active checkout separate.
