import { coachTeamIds } from "@/lib/access/policy";
import { randomUUID } from "node:crypto";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import type { CoachSession } from "@/lib/coach/session";
import { client, getGame, LiveError } from "./store";
export async function assignments(session: CoachSession) {
  const { data, error } = await client()
    .from("training_progress")
    .select("*")
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error)
    throw new LiveError(
      "Practice records are unavailable. Retry when connected.",
      503,
    );
  const ids = coachTeamIds(session);
  if (ids === null) return data ?? [];
  const players = await client()
    .from("players")
    .select("id")
    .eq("org_id", session.orgId)
    .in("team_id", ids);
  if (players.error) throw new LiveError("Roster unavailable", 503);
  const allowed = new Set((players.data ?? []).map((p) => p.id));
  return (data ?? []).filter((a) => allowed.has(a.player_id));
}
export async function assignPractice(
  session: CoachSession,
  body: {
    playerId: string;
    gameId?: string;
    scenarioId: string;
    note?: string;
  },
) {
  if (session.role === "viewer")
    throw new LiveError("A coach assigns practice.", 403);
  if (
    !body ||
    !BACKUP_SCENARIOS.some((s) => s.id === body.scenarioId) ||
    typeof body.playerId !== "string" ||
    typeof (body.note ?? "") !== "string" ||
    (body.note?.length ?? 0) > 500
  )
    throw new LiveError("Choose a player and practice activity.", 400);
  const { data: player, error } = await client()
    .from("players")
    .select("id,team_id")
    .eq("org_id", session.orgId)
    .eq("id", body.playerId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new LiveError("Roster unavailable", 503);
  if (!player) throw new LiveError("Player not found", 404);
  if (body.gameId) {
    const game = await getGame(session.orgId, body.gameId);
    if (game.config.teamId !== player.team_id)
      throw new LiveError("Choose a player from this game's team.", 400);
  }
  const row = {
    org_id: session.orgId,
    id: randomUUID(),
    player_id: body.playerId,
    game_id: body.gameId ?? null,
    scenario_id: body.scenarioId,
    note: body.note ?? "",
  };
  const { error: saveError } = await client()
    .from("training_assignments")
    .insert(row);
  if (saveError)
    throw new LiveError("Practice was not saved. Retry when connected.", 503);
  return row;
}
export async function recordAttempt(
  session: CoachSession,
  id: string,
  body: { id: string; answer: string },
) {
  if (
    !body ||
    typeof body.id !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(body.id) ||
    typeof body.answer !== "string"
  )
    throw new LiveError("Attempt ID and answer required", 400);
  const { data: assignment, error } = await client()
    .from("training_assignments")
    .select("scenario_id")
    .eq("org_id", session.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new LiveError("Practice unavailable", 503);
  if (!assignment) throw new LiveError("Practice not found", 404);
  const scenario = BACKUP_SCENARIOS.find(
    (s) => s.id === assignment.scenario_id,
  );
  if (!scenario)
    throw new LiveError("This practice activity is unavailable.", 400);
  if (
    !["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].includes(body.answer)
  )
    throw new LiveError("Choose a position on the field.", 400);
  const correct = body.answer === scenario.targetZone;
  const { error: saveError } = await client().from("training_attempts").insert({
    org_id: session.orgId,
    assignment_id: id,
    id: body.id,
    answer: body.answer,
    correct,
  });
  if (saveError && saveError.code !== "23505")
    throw new LiveError(
      "Your answer has not been saved. Retry this answer when connected.",
      503,
    );
  if (saveError) {
    const { data: receipt, error: receiptError } = await client()
      .from("training_attempts")
      .select("answer")
      .eq("org_id", session.orgId)
      .eq("assignment_id", id)
      .eq("id", body.id)
      .maybeSingle();
    if (receiptError)
      throw new LiveError("Unable to confirm your saved answer.", 503);
    if (receipt?.answer !== body.answer)
      throw new LiveError(
        "Attempt ID already used for a different answer",
        409,
      );
  }
  return {
    correct,
    explanation: correct
      ? scenario.explanation
      : "Think about who is in position to help. Try another spot.",
    duplicate: !!saveError,
  };
}
