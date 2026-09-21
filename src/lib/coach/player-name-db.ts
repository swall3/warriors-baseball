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
// ⚠️ NOT WIRED UP YET, AND THAT IS CORRECT. `public.player_aliases` does not
// exist on the live database — migrations 001–003 are written but unapplied
// (see supabase/migrations/). Nothing calls ensureAliasCache() today, so every
// canonicalPlayerName() call still resolves through the static map. Once 001
// and 003 are applied, call `ensureAliasCache()` at the top of the server
// handlers that aggregate by player and the same call sites start resolving
// against real roster data with no further change.
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
export async function fetchAliasMap(): Promise<Record<string, string>> {
  const [players, aliases] = await Promise.all([
    sbSelectAll<PlayerRow>("players", "select=id,display_name"),
    sbSelectAll<AliasRow>("player_aliases", "select=alias,player_id"),
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
export async function ensureAliasCache(force = false): Promise<void> {
  if (!force && hasAliasCache()) return;
  if (!isSupabaseEnabled()) return;
  try {
    primeAliasCache(await fetchAliasMap());
  } catch (e) {
    console.error("Player alias load failed, falling back to the static map", e);
  }
}
