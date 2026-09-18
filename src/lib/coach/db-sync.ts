import type { PersistedGamePayload } from "@/lib/coach/game-types";

const ENABLE_LOCAL_DB_SYNC = process.env.NEXT_PUBLIC_ENABLE_LOCAL_DB_SYNC !== "false";

export type GameSyncResult = {
  ok: boolean;
  gameId?: string;
  syncedEvents?: number;
  error?: string;
};

export function isDatabaseSyncEnabled() {
  return ENABLE_LOCAL_DB_SYNC;
}

export async function syncGameToDatabase(game: PersistedGamePayload): Promise<GameSyncResult> {
  if (!ENABLE_LOCAL_DB_SYNC) return { ok: false, error: "Local DB sync disabled" };
  if (typeof window !== "undefined" && !window.navigator.onLine) return { ok: false, error: "Offline" };

  try {
    const response = await fetch("/api/coach/sync/game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      return { ok: false, error: payload?.error || `Sync failed (${response.status})` };
    }
    return {
      ok: true,
      gameId: payload.gameId || game.id,
      syncedEvents: typeof payload.syncedEvents === "number" ? payload.syncedEvents : undefined,
    };
  } catch (error) {
    // Non-blocking by design: local game flow always wins even if sync fails.
    console.error("db sync failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Sync failed" };
  }
}
