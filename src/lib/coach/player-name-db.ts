// Database-backed alias loading — MERGE-PLAN.md §2.5.
//
// ⚠️ SERVER-ONLY. This file imports @/lib/supabase, which builds a client from
// the service-role key. It must never be imported by a "use client" component.
// That constraint is the reason it is a separate file from ./player-name.ts:
// the sync `canonicalPlayerName` is used all over the client, so the module
// holding it has to stay free of the Supabase client. Everything here is the
// async half of §2.5's "async alias lookup + in-memory cache"; the cache and
// the resolution logic itself live in ./player-name.ts.
//
// ⚠️ STILL NOT WIRED UP, AND THAT IS STILL CORRECT — but the reason has
// changed, so the old note is replaced rather than left to mislead. 001-003
// ARE now applied: the live database holds 11 players and 14 aliases. What is
// unresolved is MERGE-PLAN §9.4 / 003's withheld pairs. Nothing calls
// ensureAliasCache() today, so every canonicalPlayerName() call still resolves
// through the static map. To wire it up, call `ensureAliasCache(orgId)` at the
// top of the server handlers that aggregate by player and pass the same orgId
// to canonicalPlayerName().
//
// ⚠️ Priming the cache is a behaviour switch, not just a speed-up: per
// canonicalPlayerName's contract, a primed cache is authoritative and does NOT
// fall back to the static map. That is what keeps 003's withheld alias pairs
// withheld. Do not wire this up before those pairs are resolved unless you
// intend the drift spellings to stop aggregating.

import { isSupabaseEnabled, sbSelectAll } from "@/lib/supabase";
import { hasAliasCache, primeAliasCache } from "@/lib/coach/player-name";

type PlayerRow = { id: string; display_name: string };
type AliasRow = { alias: string; player_id: string };

// Reads public.player_aliases joined to public.players, and returns the flat
// alias -> display_name map that primeAliasCache() wants.
//
// Two selects rather than one embedded query: @/lib/supabase's PostgREST shim
// deliberately supports only `select=`, `order=` and `col=op.value` (see its
// header comment), not resource embedding. Both tables are tens of rows, so
// joining in memory costs nothing and avoids widening the shim's surface for
// one caller.
export async function fetchAliasMap(orgId: string): Promise<Record<string, string>> {
  // Both selects are org-scoped (§2.4). Before migration 011,
  // player_aliases.alias was a GLOBAL primary key, so the alias namespace was
  // shared across tenants and org B literally could not have a player aliased
  // 'jack' (T4). Now the key is (org_id, alias) and these two reads see one
  // org's roster — which is also what makes the in-memory join below safe: two
  // orgs' players could legitimately share an id-shaped string only if they
  // shared an org, and they cannot.
  const scope = { orgId };
  const [players, aliases] = await Promise.all([
    sbSelectAll<PlayerRow>(scope, "players", "select=id,display_name"),
    sbSelectAll<AliasRow>(scope, "player_aliases", "select=alias,player_id"),
  ]);

  const nameById = new Map<string, string>();
  for (const p of players) {
    if (p?.id && p?.display_name) nameById.set(p.id, p.display_name);
  }

  const map: Record<string, string> = {};
  for (const a of aliases) {
    const displayName = a?.player_id ? nameById.get(a.player_id) : undefined;
    // An alias whose player row is missing is skipped rather than guessed at.
    // The FK makes this unreachable in practice; it matters if the two selects
    // ever straddle a roster edit.
    if (!a?.alias || !displayName) continue;
    map[a.alias] = displayName;
  }

  return map;
}

// Loads aliases into the in-memory cache. Safe to call on every request: it
// returns early once the cache is warm.
//
// Fails soft, deliberately, and for the same reason B1 exists (MERGE-PLAN.md
// §0.3): a database that is unreachable — paused, mid-restore, misconfigured —
// must degrade this app to static-map behaviour, not take a page down. Losing
// the alias table costs correct Jack/Jackson merging; throwing here would cost
// the whole screen during a live game.
//
// `force` skips the warm-cache check, for use after a roster edit.
//
// ⚠️ `orgId` is required and is not defaulted. The cache it primes is keyed by
// org (§2.4), and a default here would put one org's roster under whichever id
// the default named — reintroducing the cross-tenant bleed that keying the
// cache was meant to remove, one layer up from where the fix lives.
export async function ensureAliasCache(orgId: string, force = false): Promise<void> {
  if (!orgId) throw new Error("ensureAliasCache requires an orgId");
  if (!force && hasAliasCache(orgId)) return;
  if (!isSupabaseEnabled()) return;
  try {
    primeAliasCache(orgId, await fetchAliasMap(orgId));
  } catch (e) {
    console.error("Player alias load failed, falling back to the static map", e);
  }
}
