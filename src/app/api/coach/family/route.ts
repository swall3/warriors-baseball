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
      : linkedPlayers.length === 1 ? linkedPlayers[0] : undefined;
    const parentTeams = Object.entries(s.teamRoles ?? {})
      .filter(([, r]) => r === "parent")
      .map(([id]) => id);
    const teams = selected ? [selected.teamId] : parentTeams;
    const playerIds = selected ? [selected.id] : (s.playerIds ?? []);
    const db = accessDb();
    const [games, practice, players, events, gameProgress] = await Promise.all([
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
      // Batting stats only make sense for ONE kid at a time. Identify plate
      // appearances by batter_player_id (the roster-identity FK) — for this
      // org it is populated for every named roster player and null only for
      // opponents, which is exactly the split a parent wants. When "all kids"
      // is showing (no single selection), skip this query entirely.
      selected
        ? db
            .from("play_events")
            .select("game_id,result")
            .eq("org_id", s.orgId)
            .eq("batter_player_id", selected.id)
            .limit(2000)
        : Promise.resolve({ data: [], error: null }),
      // Learning-game progress (Phase 3) — per selected kid, from game_progress.
      selected
        ? db
            .from("game_progress")
            .select("game_key,correct,total,streak,best_streak")
            .eq("org_id", s.orgId)
            .eq("player_id", selected.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (
      games.error ||
      practice.error ||
      players.error ||
      events.error ||
      gameProgress.error
    )
      throw new LiveError("Family updates unavailable.", 503);

    // Simple, honest 9U batting line — no invented sabermetrics. AB counts
    // every recorded result (there are no walk/HBP results in this data);
    // hits = single/double/triple. Games played = distinct games with a PA.
    const HIT = new Set(["single", "double", "triple"]);
    const ev = events.data ?? [];
    const hits = ev.filter((e) => HIT.has(e.result)).length;
    const atBats = ev.length;
    const stats = selected
      ? {
          gamesPlayed: new Set(ev.map((e) => e.game_id)).size,
          atBats,
          hits,
          singles: ev.filter((e) => e.result === "single").length,
          doubles: ev.filter((e) => e.result === "double").length,
          triples: ev.filter((e) => e.result === "triple").length,
          average:
            atBats > 0 ? (hits / atBats).toFixed(3).replace(/^0/, "") : "—",
        }
      : null;

    const gameList = games.data.map((g) => ({
      id: g.id,
      date: g.state.config.date as string,
      opponent: g.state.config.opponent as string,
      status: g.state.status as string,
    }));
    // "Upcoming" = games dated today or later. This org's only games are
    // imported past ones, so an empty upcoming section would read as broken:
    // return both, and let the UI show upcoming when present, recent otherwise.
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = gameList.filter((g) => (g.date ?? "") >= today);

    return reply({
      games: gameList,
      upcoming,
      stats,
      gameProgress: gameProgress.data ?? [],
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
