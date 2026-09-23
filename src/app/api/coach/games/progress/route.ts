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

// Body: { attemptId, gameKey, correct, daily?: { streak, best } }.
// The database locks this player's aggregate and ignores repeat request IDs.
export async function POST(request: Request) {
  try {
    const s = await sessionFor(request, true);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const player = requirePlayer(request, s.playerIds ?? []);
    const body = await request.json();
    const gameKey = body.gameKey;
    if (typeof gameKey !== "string" || !/^[a-z0-9_-]{1,64}$/.test(gameKey))
      throw new LiveError("Invalid game.", 400);
    if (typeof body.attemptId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.attemptId) ||
        typeof body.correct !== "boolean")
      throw new LiveError("Invalid answer.", 400);
    const daily = body.daily;
    if (daily !== undefined &&
        (typeof daily !== "object" || daily === null ||
         !Number.isInteger(daily.streak) || daily.streak < 0 || daily.streak > 3650 ||
         !Number.isInteger(daily.best) || daily.best < 0 || daily.best > 3650))
      throw new LiveError("Invalid streak.", 400);
    const db = accessDb();
    const result = await db.rpc("record_game_progress", {
      p_org: s.orgId,
      p_player: player,
      p_key: gameKey,
      p_attempt: body.attemptId,
      p_correct: body.correct,
      p_streak: daily?.streak ?? null,
      p_best: daily?.best ?? null,
    });
    if (result.error) throw new LiveError("Could not save progress.", 503);
    return reply({ ok: true, recorded: result.data });
  } catch (e) {
    return failure(e);
  }
}
