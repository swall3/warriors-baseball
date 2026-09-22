# Contact density and historical backend review

The contact map now uses a single relative frequency scale with blue-to-red blended regions and contour rings, similar to a Wi-Fi coverage map. Team and outcome filters, smoothing, optional contact points, tap inspection, and an accessible contact table share the same filtered data. Walks, strikeouts, and invalid coordinates are excluded. Imported locations can be approximate; intensity is relative to the current selection, not comparable across different filters.

## Backend changes

- Corrected the map fetch URL to the existing historical play-events endpoint.
- Paginated organization-scoped historical reads in stable ID order, preventing the default database row limit from truncating a season. Each request has a 10-second timeout.
- Configured database failures now propagate instead of returning bundled sample data. Fixtures are only available in unconfigured, non-production development for the original owner organization.
- Preserved pitch event types and excluded pitches from contact pins.
- Grouped events once per game instead of repeatedly scanning the event list.
- Validated team filters and marked successful historical responses private/no-store.
- Added visible load errors and retry controls to historical reports.

## Verification

- Production build, density unit tests, and disposable local database integration tests.
- Fixture: 1,101 contacts plus one pitch; verified pagination, pitch semantics, invalid filters, private responses, and cross-organization denial.
- Local database outage test verifies an unavailable response without sample games.
- Desktop and 390px phone browser checks cover density rendering, filters, contact overlay, and layout.
- Read-only live audit: 119 historical events, zero missing organization IDs and zero invalid contact coordinates. Production data was not changed.

## Remaining backend work

This is a focused historical-data cleanup, not a complete backend audit. Historical imports/device games and shared live-game records still use separate models. Follow-up work should unify reporting over those models, move season aggregation into scoped database queries, and review all remaining service-role access paths. Historical reads still load a complete organization history into memory; pagination fixes completeness, not long-term aggregation scale.

## Local test commands

Apply tests/historical-fixture.sql only to the disposable codex-ninety-feet-db-tests container, with the local review proxy and app on port 4181. Run node --experimental-strip-types --test tests/contact-density.test.mjs tests/historical-api.test.mjs. For the outage test, stop the disposable REST container, set TEST_HISTORY_OUTAGE=1, run the historical API test, and restart the container afterward.
