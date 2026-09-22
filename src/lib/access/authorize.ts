import type { CoachSession } from "@/lib/coach/session";
import { accessDb } from "./identity";
import { canCoachTeam, canReadTeam, orgAdmin, isFamilyOnly } from "./policy";
import { LiveError } from "@/lib/coach/live/store";

// Central, fail-closed route policy. New APIs must explicitly opt into team access.
export async function authorizeRequest(s: CoachSession, request: Request) {
  if (!s.userId || orgAdmin(s)) return;
  const url = new URL(request.url),
    path = url.pathname.replace(/\/$/, "");
  const read = request.method === "GET";
  const db = accessDb();
  const denied = () => {
    throw new LiveError("This action is outside your team access.", 403);
  };
  const lookup = async (table: string, id: string, column: string) => {
    const { data, error } = await db
      .from(table)
      .select(column)
      .eq("org_id", s.orgId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new LiveError("Access verification is unavailable.", 503);
    if (!data) throw new LiveError("Record not found.", 404);
    return data as unknown as Record<string, string>;
  };
  const coach = (team: string) => {
    if (!canCoachTeam(s, team)) denied();
  };
  if (path === "/api/coach/catalog" && read) return;
  if (path === "/api/coach/family" && read) return;
  if (/^\/api\/coach\/training\/[^/]+$/.test(path) && !read) {
    const assignment = await lookup(
      "training_assignments",
      path.split("/").pop()!,
      "player_id",
    );
    if (s.playerIds?.includes(assignment.player_id)) return;
    coach((await lookup("players", assignment.player_id, "team_id")).team_id);
    return;
  }
  // billingScope checks the actual team after the route has parsed its body.
  if (path.startsWith("/api/coach/billing")) return;
  // A parent may use an explicitly assigned recorder link for their own team.
  // actorFor verifies the token, expiry and command lane before any game action.
  if (
    /^\/api\/coach\/live\/[^/]+$/.test(path) &&
    request.headers.get("x-recording-token")
  ) {
    const game = await lookup(
      "live_games",
      decodeURIComponent(path.split("/")[4]),
      "team_id",
    );
    if (!canReadTeam(s, game.team_id)) denied();
    return;
  }
  if (isFamilyOnly(s)) denied();
  if (path === "/api/coach/access") return; // RPC performs role and target checks under a lock.
  if (
    [
      "/api/coach/live",
      "/api/coach/training",
      "/api/coach/reports",
      "/api/coach/workload",
    ].includes(path) &&
    read
  )
    return; // Filtered before returning data.
  if (path === "/api/coach/roster") {
    const team = read
      ? url.searchParams.get("teamId")
      : (await request.clone().json()).teamId;
    coach(team ?? "");
    return;
  }
  if (path === "/api/coach/live" && !read) {
    coach((await request.clone().json()).config?.teamId ?? "");
    return;
  }
  if (/^\/api\/coach\/live\/[^/]+(?:\/(crew|insights))?$/.test(path)) {
    const game = await lookup(
      "live_games",
      decodeURIComponent(path.split("/")[4]),
      "team_id",
    );
    coach(game.team_id);
    return;
  }
  if (path === "/api/coach/training" && !read) {
    coach(
      (
        await lookup(
          "players",
          (await request.clone().json()).playerId,
          "team_id",
        )
      ).team_id,
    );
    return;
  }
  // Historic imports have no own-team key. Until classified, only organization managers see them.
  denied();
}
