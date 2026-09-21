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

This is an intermediate checkpoint, not a completed integration. Still required: connect the existing-app screens, tenant branding/roster loading, offline command queue and conflict review, dugout polling/staleness, persisted training assignments/progress, computed postgame summaries and compatibility with existing insights, API/browser acceptance tests, final review and handoff. League-specific pitch limits require verified configuration; no generic numerical safety thresholds are inferred.

## Local verification

```sh
node --experimental-strip-types --test tests/live-model.test.mjs
npx tsc --noEmit
```

The SQL assertions are for a disposable isolated PostgreSQL 16 container only. `tests/live-database.sql` creates test-only base tables and roles before applying the new migration; do not execute that fixture against an existing database. The concurrency test targets only container `codex-ninety-feet-db-tests`.

Supabase documentation checked: https://supabase.com/docs/reference/javascript/rpc and current changelog. The migration was generated with the Supabase CLI. It has not been applied to production.
