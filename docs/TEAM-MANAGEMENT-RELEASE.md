# Team management and one game setup path

The Team page now edits the existing team name, adds players, edits player names/jerseys, and makes players inactive or restores them without deleting their history. Saves use authenticated, same-origin, organization-scoped endpoints; viewers cannot edit. Active rosters feed new shared games. Saved games keep their recorded names and lineup.

The live team record team-outlaws was renamed from Outlaws to Warriors, preserving its ID and references. Opponent teams were untouched. This is data correction, not a schema migration.

/coach now redirects to Today and /coach/lineup to shared game preparation. Analytics navigation and the main footer use the same game-day and setup destinations. The older device-only scorer and rotation planner remain under /coach/legacy and /coach/legacy/lineup, reachable only through the explicit older-game recovery section in Review. Historical analytics remain accessible.

Validation: Next production build and TypeScript; isolated roster API lifecycle test covering role, organization, origin, validation, create/edit/inactivate/restore and stable identity; browser team rename and player jersey edit persisted across reload. Local fixture service_role grants were updated to match existing production insert/update privileges. No production roster test players created.
