import { sessionFor, reply, failure } from "@/lib/coach/live/http";
import { accessDb } from "@/lib/access/identity";
import { LiveError } from "@/lib/coach/live/store";
// Decision 5 (PRACTICE-ASSIGNMENT-AND-DRILLS.md): a parent can have more than
// one linked player, possibly on different teams (the same org — a different
// org means a different session entirely, selected via /account). `player`
// is an optional query param naming the currently switched-to kid. It is
// ALWAYS checked against the server-resolved session (s.playerIds), never
// trusted outright: a client-supplied id outside that set is rejected rather
// than silently ignored or widened, so switching kids can never become a
// cross-parent or cross-team read.
export async function GET(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const linkedPlayers = s.players ?? [];
    const requested = new URL(request.url).searchParams.get("player");
    if (requested && !(s.playerIds ?? []).includes(requested))
      throw new LiveError("Choose one of your linked players.", 403);
    const selected = requested
      ? linkedPlayers.find((p) => p.id === requested)
      : undefined;
    const parentTeams = Object.entries(s.teamRoles ?? {})
      .filter(([, r]) => r === "parent")
      .map(([id]) => id);
    const teams = selected ? [selected.teamId] : parentTeams;
    const playerIds = selected ? [selected.id] : (s.playerIds ?? []);
    const db = accessDb();
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
        .in("player_id", playerIds)
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
      // Full roster of linked kids (with team) for the switcher, plus which
      // one (if any) this response was scoped to.
      linkedPlayers,
      selectedPlayerId: selected?.id ?? null,
    });
  } catch (e) {
    return failure(e);
  }
}
