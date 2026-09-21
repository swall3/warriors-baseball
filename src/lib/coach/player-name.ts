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
// Runtime alias cache — PER ORG (MULTI-TENANT-PLAN.md §2.4)
// ---------------------------------------------------------------------------
// Populated from public.player_aliases by ./player-name-db.ts. Keys are
// lower(btrim(x)), matching the 001 invariant; values are the player's
// display_name.
//
// ⚠️ THIS WAS A SINGLE MODULE-LEVEL OBJECT AND THAT WAS A REAL BUG, not a
// stylistic shortcut. Module state on a server persists across requests and is
// shared by all of them. With one cache, the first request to prime it decided
// the roster for every subsequent request — so org B's coach would have been
// served org A's kids' names, wherever a cached alias happened to hit. The
// file's own header justified the singleton on single-tenant grounds, which
// was honest and is now false. It becomes wrong the moment tenant #2 exists,
// and it fails in the direction that leaks names rather than the direction
// that errors.
//
// Keyed by org, the same state is correct: the alias set is small (tens of
// rows per org), changes only when a coach edits the roster, and priming one
// org's entry cannot touch another's.
const aliasCaches = new Map<string, Record<string, string>>();

// Replaces one org's cache wholesale. Called by the server-side loader;
// exported unattached to any I/O so tests can drive it directly.
export function primeAliasCache(orgId: string, entries: Record<string, string>): void {
  if (!orgId) throw new Error("primeAliasCache requires an orgId");
  const next: Record<string, string> = {};
  for (const [alias, displayName] of Object.entries(entries)) {
    const key = alias.trim().toLowerCase();
    const value = (displayName || "").trim();
    if (!key || !value) continue;
    next[key] = value;
  }
  aliasCaches.set(orgId, next);
}

// Drops one org's cache, so its lookups fall back to the static map again.
// Omitting orgId drops every org's — for tests and for a full roster reload.
export function clearAliasCache(orgId?: string): void {
  if (orgId === undefined) aliasCaches.clear();
  else aliasCaches.delete(orgId);
}

// True once this org's cache has been primed — lets the loader skip redundant
// reads without exposing the cache itself.
export function hasAliasCache(orgId: string): boolean {
  return aliasCaches.has(orgId);
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
//
// ⚠️ `orgId` IS OPTIONAL, AND ITS ABSENCE MEANS "STATIC MAP ONLY" — never
// "whichever org primed last." That distinction is the whole per-org fix
// (§2.4), so it is worth being explicit about why the parameter is not simply
// required:
//
// This function is synchronous and is imported by "use client" components
// (coach/page.tsx, dashboard/page.tsx, stats/page.tsx) and by pure logic
// (lineup.ts, analytics.ts). Those callers have no request context and no org
// to pass — threading one to them would mean making lineup.ts's `assignmentFor`
// tenant-aware, which is the context-object-through-pure-functions cost this
// module's original header correctly refused to pay.
//
// Making the parameter optional resolves that without reopening the bug: a
// caller that cannot name an org gets the static map, which is exactly what it
// gets today (nothing primes a cache in the browser). A caller that CAN name an
// org gets that org's roster and no other org's. There is no code path that
// reads a cache it did not ask for by id, which is the property that was
// missing.
export function canonicalPlayerName(name?: string | null, orgId?: string): string {
  const raw = (name || "").trim();
  if (!raw) return "Unknown";
  const key = raw.toLowerCase();
  if (orgId) {
    const cache = aliasCaches.get(orgId);
    // Primed means authoritative — see the no-fallback-on-miss rule above.
    if (cache) return cache[key] || raw;
  }
  return NAME_ALIASES[key] || raw;
}
