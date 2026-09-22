import { sessionFor, reply, failure } from "@/lib/coach/live/http";
import { accessDb } from "@/lib/access/identity";
import { LiveError } from "@/lib/coach/live/store";
export async function GET(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const teams = Object.entries(s.teamRoles ?? {})
        .filter(([, r]) => r === "parent")
        .map(([id]) => id),
      db = accessDb();
    const [games, practice, players] = await Promise.all([
      db
        .from("live_games")
        .select("id,team_id,state")
        .eq("org_id", s.orgId)
        .in("team_id", teams)
        .order("updated_at", { ascending: false })
        .limit(100),
      db
        .from("training_progress")
        .select("id,player_id,scenario_id,note,created_at")
        .eq("org_id", s.orgId)
        .in("player_id", s.playerIds ?? [])
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("players")
        .select("id,display_name")
        .eq("org_id", s.orgId)
        .in("id", s.playerIds ?? []),
    ]);
    if (games.error || practice.error || players.error)
      throw new LiveError("Family updates unavailable.", 503);
    return reply({
      games: games.data.map((g) => ({
        id: g.id,
        date: g.state.config.date,
        opponent: g.state.config.opponent,
        status: g.state.status,
      })),
      practice: practice.data,
      players: players.data,
    });
  } catch (e) {
    return failure(e);
  }
}
