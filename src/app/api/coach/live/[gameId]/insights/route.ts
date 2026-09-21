import { client, getGame, LiveError } from "@/lib/coach/live/store";
import { gameInsights, type Receipt } from "@/lib/coach/live/insights";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const session = await sessionFor(request);
    const { gameId } = await params;
    const game = await getGame(session.orgId, gameId);
    const receipts: Receipt[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client()
        .from("live_game_commands")
        .select("id,revision,command,before_state,after_state,created_at")
        .eq("org_id", session.orgId)
        .eq("game_id", gameId)
        .lte("revision", game.revision)
        .order("revision")
        .range(offset, offset + 499);
      if (error)
        throw new LiveError(
          "Game insights are unavailable. Retry when the connection returns.",
          503,
        );
      receipts.push(...(data as Receipt[]));
      if (data.length < 500) break;
    }
    return reply({ ok: true, game, insights: gameInsights(game, receipts) });
  } catch (e) {
    return failure(e);
  }
}
