<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Scenario answers are server-only

`src/lib/gameData.ts` (`BACKUP_SCENARIOS`) and `src/lib/practice/bundles.ts` are
server-only — they hold the paid answers (`question`/`targetZone`/`explanation`).
**Client components must import scenario data from `@/lib/scenarioCatalog`,
`@/lib/scenarioTypes`, or `@/lib/practice/bundleSummaries`, never from
`gameData`/`bundles`.** After adding or editing scenarios, run
`npm run prebuild` to regenerate the catalog. See
`docs/BACKEND-VERIFICATION.md` → "Scenario answer isolation".
