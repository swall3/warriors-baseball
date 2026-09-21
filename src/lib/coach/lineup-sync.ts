// Opportunistic sync of the lineup plan to /api/coach/lineup.
//
// Deliberately mirrors db-sync.ts: same enable flag, same offline short-circuit,
// same "never throw, always return a result object" contract. A failed sync must
// never block the live game flow — localStorage is the write-ahead buffer and
// the source of truth for the dugout; the server copy is what makes the plan
// survive a lost phone and show up on the dashboard laptop.
import { normalizePlan, type LineupPlan } from "@/lib/coach/lineup";

const ENABLE_LOCAL_DB_SYNC = process.env.NEXT_PUBLIC_ENABLE_LOCAL_DB_SYNC !== "false";

export type LineupSyncResult = {
  ok: boolean;
  updatedAt?: string;
  error?: string;
};

export async function saveLineupPlan(plan: LineupPlan): Promise<LineupSyncResult> {
  if (!ENABLE_LOCAL_DB_SYNC) return { ok: false, error: "Local DB sync disabled" };
  if (typeof window !== "undefined" && !window.navigator.onLine) return { ok: false, error: "Offline" };

  try {
    const response = await fetch("/api/coach/lineup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      return { ok: false, error: payload?.error || `Save failed (${response.status})` };
    }
    return { ok: true, updatedAt: payload.updatedAt };
  } catch (error) {
    // Non-blocking by design: the dugout keeps working offline.
    console.error("lineup sync failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "Save failed" };
  }
}

export async function fetchLineupPlan(params: { id?: string; gameId?: string }): Promise<LineupPlan | null> {
  const query = new URLSearchParams();
  if (params.id) query.set("id", params.id);
  else if (params.gameId) query.set("gameId", params.gameId);

  try {
    const response = await fetch(`/api/coach/lineup?${query.toString()}`);
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    if (!payload?.ok) return null;
    return normalizePlan(payload.plan);
  } catch (error) {
    console.error("lineup fetch failed", error);
    return null;
  }
}
