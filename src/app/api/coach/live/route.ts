import { canCoachTeam } from "@/lib/access/policy";
import { after } from "next/server";
import { safelyDeliver } from "@/lib/notifications/server";
import { createGame, listGames } from "@/lib/coach/live/store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    return reply({
      ok: true,
      games: (await listGames(session.orgId)).filter((g) =>
        canCoachTeam(session, g.config.teamId),
      ),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const session = await sessionFor(request, true);
    const body = await request.json();
    const game = await createGame(session, body.config);
    after(() => safelyDeliver(session.orgId));
    return reply({ ok: true, game }, 201);
  } catch (e) {
    return failure(e);
  }
}
