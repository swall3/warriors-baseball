# Game-day flow verification — September 21, 2026

## Release changes

- Today → Prepare → Play → Review → Practice navigation, with current game links and status-aware steps.
- Completed games open their review; login defaults to Today.
- Save game & set up devices opens Crew & devices directly.
- Legacy device-only scorer mounts after hydration and preserves balls/strikes across reloads.

## Validation

- Production build and TypeScript pass.
- 13 live model/API/concurrency tests pass against the isolated local Postgres/PostgREST fixture.
- Six-inning API trial: 109 pitches, split pitch/play grants, first-pitch home run, pitcher change, board state matching every half-inning, final 1–0, display write denied.
- Browser trial: prepare game, issue pitch/play links, record ball and ball in play on pitch lane, record LF double/runner at second on play lane, board reflects two pitches and assigned positions, finish, review LF contact, assign practice, answer rep, reopen persisted progress.
- Legacy browser scorer: 1–1 count retained after reload, no hydration error observed.
- Phone width 390px: practice page fits (375px body), scrollable step navigation. Tablet board checked at 1024 × 768.
- Corrected preparation handoff verified in browser on a second isolated test game.

## Limits

Synthetic games and practice were written only to the isolated local fixture. Production verification is deployment/public-page smoke testing, not a real-roster game. Browser viewport checks do not establish physical iPad/phone behavior, outdoor readability, real cellular recovery, or wake-lock support. A field trial remains appropriate before relying on the app during a real game. League-specific pitch/rest limits are not configured.
