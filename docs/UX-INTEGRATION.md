# Ninety Feet integration — working record

## Baseline and boundaries

Isolated clone: `/home/swall/codex-work/ninety-feet-ux`, branch `codex/ninety-feet-ux`, based on MT-3 commit `b2bcac0`. No shared git directory or working files with OpenClaw. OpenClaw main and merge checkouts were clean at initial inspection and pointed to that commit.

Read-only session evidence: MT-3 implementation succeeded; its separate verify/deploy task failed because OpenClaw lacked a route-compatible OpenAI authentication source. Vercel's connected API returned 403 for the project's team scope, so the current deployed commit is unverified. Neither failure prevents local implementation. No production writes, migrations, merge, or deployment are authorized by this goal.

## Architecture decisions

- Preserve legacy games and device storage. New shared games have their own aggregate and append-only command receipts. Whole-game imports cannot overwrite these aggregates.
- Session org is the only tenant authority. All table queries include that org, and composite foreign keys bind game/team identity within it.
- The existing MT-3 server-only service-role connection is retained. New tables enable RLS and deny anon/authenticated access; they expose no direct browser data API. This is server-enforced authorization, not a claim of per-user RLS enforcement on service-role traffic.
- Each command includes an idempotency ID and expected revision. A short Postgres row lock checks receipt and revision, then atomically stores command and resulting state. A conflict requires review; it is not automatically rebased.
- Pitch commands increment the active pitcher's count. A ball-in-play command creates a pending pitch ID. Its result must reference that ID and never increments the total again.
- Corrections undo only the most recent action with its exact ID. The audit receipt remains. Finalization may be undone by a coach.
- A recorder grant identifies a game assignment/device, not a verified person. MT-3 passcodes identify an organization/role only. Grant links require an existing session for the same org, expire after 18 hours, and can be revoked. A viewer session without a grant is read-only; pitch/play/all lanes cannot perform coach actions.
- No default seeded roster or fictional analytics will be served as tenant data when the live database is unavailable. Shared-game requests fail explicitly; legacy device-only scoring remains available separately.

## Current progress

Implemented the pure game command model, server routes, recorder grants, and unapplied database migration. Nine game-model tests and TypeScript checks pass. Isolated Postgres assertions verify receipts, stale revisions, payload/actor mismatch, independent tenants, table/function grants, and RLS enabled. Real concurrent commit verification is in `tests/live-concurrency.test.mjs`.

Second checkpoint: Today and Team load the signed-in organization's actual catalog, branding and roster. Preparation saves through the database API; live scoring, crew-link management, coach controls and a polling dugout display are connected. A persistent browser command queue and explicit conflict review are implemented but still require adversarial/offline verification. Existing scorer, imports, planner, analytics and public training routes remain available. A workspace entry link is added to the older coach screens.

The first browser/API/database path passed against the disposable local stack: prepare a game with reordered batting lineup, start, record ball plus in-play, resolve LF double. PostgreSQL showed revision 4, two pitches for the original pitcher and the batter on second. This also caught and fixed a local reverse-proxy origin comparison issue. The new workspace loaded without a browser error overlay. Metadata and smooth-scroll warnings were reviewed; the unrelated metadataBase warning remains from the existing root configuration.

This is an intermediate checkpoint, not a completed integration. Still required: persisted training assignments/progress; computed postgame summaries and compatibility with existing insights; full API authorization, recorder, offline and browser/device acceptance tests; UI review; final review and handoff. Some new navigation targets point to these forthcoming screens. League-specific pitch limits require verified configuration; no generic numerical safety thresholds are inferred.

Local review uses `http://localhost:4180/coach/today`, `.env.local` containing only synthetic local credentials, PostgreSQL container `codex-ninety-feet-db-tests`, PostgREST container `codex-ninety-feet-rest` on localhost:54389, and `scripts/local-review-proxy.mjs` on localhost:54390. All database rows used here are synthetic. The review fixture must never run against production.

## Local verification

```sh
node --experimental-strip-types --test tests/live-model.test.mjs
npx tsc --noEmit
```

The SQL assertions are for a disposable isolated PostgreSQL 16 container only. `tests/live-database.sql` creates test-only base tables and roles before applying the new migration; do not execute that fixture against an existing database. The concurrency test targets only container `codex-ninety-feet-db-tests`.

Supabase documentation checked: https://supabase.com/docs/reference/javascript/rpc and current changelog. The migration was generated with the Supabase CLI. It has not been applied to production.
