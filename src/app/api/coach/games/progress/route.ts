import { sessionFor, reply, failure } from "@/lib/coach/live/http";
import { accessDb } from "@/lib/access/identity";
import { LiveError } from "@/lib/coach/live/store";

// Learning-game progress per kid (parent view Phase 3). Aggregate row per
// (org, player, game_key). The player is ALWAYS validated against the
// session's playerIds — same 403 gate as /api/coach/family — so a parent can
// only read/write progress for a kid actually linked to them. game_key is
// free text (rules/backup/position/daily/skill categories); we do not
// enumerate it server-side.

function requirePlayer(request: Request, playerIds: string[]): string {
  const player = new URL(request.url).searchParams.get("player");
  if (!player || !playerIds.includes(player))
    throw new LiveError("Choose one of your linked players.", 403);
  return player;
}

export async function GET(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const player = requirePlayer(request, s.playerIds ?? []);
    const db = accessDb();
    const rows = await db
      .from("game_progress")
      .select("game_key,correct,total,streak,best_streak,updated_at")
      .eq("org_id", s.orgId)
      .eq("player_id", player);
    if (rows.error) throw new LiveError("Progress unavailable.", 503);
    return reply({ progress: rows.data });
  } catch (e) {
    return failure(e);
  }
}

// Body: { gameKey, correct: boolean, sessionComplete?: boolean,
//         daily?: { streak, best } }. Increments the aggregate atomically via
// an upsert-then-increment; the row is small and per-kid so contention is a
// non-issue at this scale.
export async function POST(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const player = requirePlayer(request, s.playerIds ?? []);
    const body = await request.json();
    const gameKey =
      typeof body.gameKey === "string" ? body.gameKey.slice(0, 64) : "";
    if (!gameKey) throw new LiveError("Missing game.", 400);
    const db = accessDb();

    // Read current, compute next, write. RLS + service-role, single kid row.
    const current = await db
      .from("game_progress")
      .select("correct,total,streak,best_streak")
      .eq("org_id", s.orgId)
      .eq("player_id", player)
      .eq("game_key", gameKey)
      .maybeSingle();
    if (current.error) throw new LiveError("Progress unavailable.", 503);

    const prev = current.data ?? {
      correct: 0,
      total: 0,
      streak: null,
      best_streak: null,
    };
    const next = {
      org_id: s.orgId,
      player_id: player,
      game_key: gameKey,
      correct: prev.correct + (body.correct === true ? 1 : 0),
      total: prev.total + 1,
      streak:
        body.daily && typeof body.daily.streak === "number"
          ? body.daily.streak
          : (prev.streak ?? null),
      best_streak:
        body.daily && typeof body.daily.best === "number"
          ? Math.max(body.daily.best, prev.best_streak ?? 0)
          : (prev.best_streak ?? null),
      updated_at: new Date().toISOString(),
    };
    const up = await db
      .from("game_progress")
      .upsert(next, { onConflict: "org_id,player_id,game_key" });
    if (up.error) throw new LiveError("Could not save progress.", 503);
    return reply({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
