// Player name canonicalization — MERGE-PLAN.md §2.5, fixes B6.
//
// One kid, many spellings. This module answers "which player is this string?"
// and is the single chokepoint every aggregation must pass through.
//
// ⚠️ CLIENT-SAFE ON PURPOSE. `canonicalPlayerName` is imported by "use client"
// components (src/app/coach/page.tsx, dashboard/page.tsx) and by pure logic
// (src/lib/coach/lineup.ts), so this file must stay synchronous and must NOT
// import @/lib/supabase — that would pull the service-role client into the
// client bundle. The async database lookup lives in ./player-name-db.ts, which
// is server-only and primes the cache below.

// ---------------------------------------------------------------------------
// Static fallback map
// ---------------------------------------------------------------------------
// The original hardcoded map, kept verbatim in behaviour. It remains the
// authority until `public.player_aliases` is seeded (migrations 001–003 are
// written but NOT applied — see supabase/migrations/003_seed_roster.sql).
//
// Its flaws are known and documented as B6: the direction is inconsistent
// (jackson→Jack is long→short, linc→Lincoln and aidan→Aiden are short→long),
// and it is hardcoded to one roster, so a genuinely different kid named
// Jackson can never be represented. The alias table is what fixes that; this
// map is the bridge until then.
const NAME_ALIASES: Record<string, string> = {
  jackson: "Jack",
  jack: "Jack",
  linc: "Lincoln",
  lincoln: "Lincoln",
  aidan: "Aiden",
  aiden: "Aiden",
};

export const STATIC_NAME_ALIASES: Readonly<Record<string, string>> = NAME_ALIASES;

// ---------------------------------------------------------------------------
// Runtime alias cache
// ---------------------------------------------------------------------------
// Populated from public.player_aliases by ./player-name-db.ts. Keys are
// lower(btrim(x)), matching the 001 invariant; values are the player's
// display_name.
//
// Module-level mutable state is the right shape here: the alias set is small
// (tens of rows), changes only when a coach edits the roster, and every caller
// is synchronous. A per-request cache would mean threading a context object
// through pure functions like lineup.ts's `assignmentFor`, for no benefit.
let aliasCache: Record<string, string> | null = null;

// Replaces the cache wholesale. Called by the server-side loader; exported
// unattached to any I/O so tests can drive it directly.
export function primeAliasCache(entries: Record<string, string>): void {
  const next: Record<string, string> = {};
  for (const [alias, displayName] of Object.entries(entries)) {
    const key = alias.trim().toLowerCase();
    const value = (displayName || "").trim();
    if (!key || !value) continue;
    next[key] = value;
  }
  aliasCache = next;
}

// Drops the cache, so lookups fall back to the static map again.
export function clearAliasCache(): void {
  aliasCache = null;
}

// True once the cache has been primed — lets the loader skip redundant reads
// without exposing the cache itself.
export function hasAliasCache(): boolean {
  return aliasCache !== null;
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------
// Once the cache is primed it is AUTHORITATIVE — a cache miss resolves to the
// raw string, it does not fall back to the static map. Order is:
//
//   cache primed + hit  -> the cached display name
//   cache primed + miss -> the raw string as typed
//   cache absent        -> static map, then the raw string
//
// ⚠️ The no-fallback-on-miss rule is load-bearing, not tidiness. The static map
// contains jackson -> Jack, linc -> Lincoln and aidan -> Aiden, and those are
// exactly the three merges deliberately withheld from
// supabase/migrations/003_seed_roster.sql pending Stuart's confirmation. If a
// miss fell through to the static map, priming the cache from a correctly
// seeded player_aliases table would silently re-apply the unconfirmed merges
// at the app layer — undoing the migration's whole point on the day the
// question gets answered. Withheld must mean withheld at every layer.
//
// Falling through to the raw string is likewise deliberate. An unrecognized
// name is displayed and counted under exactly what the coach typed rather than
// being dropped or bucketed into "Unknown" — the same principle as 002's
// nullable batter_player_id: never lose a plate appearance to a typo.
//
// Behaviour is unchanged from the original implementation whenever the cache
// is empty, which is every code path today.
export function canonicalPlayerName(name?: string | null): string {
  const raw = (name || "").trim();
  if (!raw) return "Unknown";
  const key = raw.toLowerCase();
  if (aliasCache) return aliasCache[key] || raw;
  return NAME_ALIASES[key] || raw;
}
