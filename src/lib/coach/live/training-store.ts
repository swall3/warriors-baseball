import { coachTeamIds } from "@/lib/access/policy";
import { randomUUID } from "node:crypto";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import { getPositionPracticeBundle } from "@/lib/practice/bundles";
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
  const rows = ids === null ? (data ?? []) : await filterAllowed(session, ids, data ?? []);
  // Resolve display text server-side so clients render the prompt/label without
  // importing the answer pool. scenario_question can hint the answer, so it is
  // only sent to these authenticated coach/parent rows (never a public bundle).
  return rows.map((r) => {
    const scenario = BACKUP_SCENARIOS.find((s) => s.id === r.scenario_id);
    return {
      ...r,
      scenario_label: scenario?.label ?? null,
      scenario_question: scenario?.question ?? null,
    };
  });
}
// Coach-facing rollup of assigned position-practice bundles (Decision 1).
// Individual scenario progress underneath is unchanged (see assignments()).
//
// Degrades to an empty list (rather than throwing) if the underlying view is
// missing — e.g. this code has merged ahead of the additive migration that
// creates training_bundle_progress being applied. Legacy single-scenario
// assignments must keep working from assignments() regardless.
export async function bundleAssignments(session: CoachSession) {
  const { data, error } = await client()
    .from("training_bundle_progress")
    .select("*")
    .eq("org_id", session.orgId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return [];
  const ids = coachTeamIds(session);
  const rows = ids === null ? (data ?? []) : await filterAllowed(session, ids, data ?? []);
  return rows.map((b) => {
    const bundle = getPositionPracticeBundle(b.bundle_id);
    // Send only the client-safe summary (no scenarioIds — those would let a
    // client recover targetZone via ballZone). Scenario count already lives on
    // the row as scenario_count.
    return {
      ...b,
      bundle: bundle
        ? {
            id: bundle.id,
            position: bundle.position,
            label: bundle.label,
            skillFocus: bundle.skillFocus,
            scenarioCount: bundle.scenarioIds.length,
            categoryCounts: bundle.categoryCounts,
          }
        : null,
    };
  });
}
async function filterAllowed<T extends { player_id: string }>(
  session: CoachSession,
  teamIds: string[],
  rows: T[],
): Promise<T[]> {
  const players = await client()
    .from("players")
    .select("id")
    .eq("org_id", session.orgId)
    .in("team_id", teamIds);
  if (players.error) throw new LiveError("Roster unavailable", 503);
  const allowed = new Set((players.data ?? []).map((p) => p.id));
  return rows.filter((a) => allowed.has(a.player_id));
}
async function resolvePlayerForAssignment(
  session: CoachSession,
  body: { playerId?: unknown; gameId?: unknown; note?: unknown },
) {
  if (
    !body ||
    typeof body.playerId !== "string" ||
    typeof (body.note ?? "") !== "string" ||
    ((body.note as string | undefined)?.length ?? 0) > 500
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
    if (typeof body.gameId !== "string")
      throw new LiveError("Choose a player from this game's team.", 400);
    const game = await getGame(session.orgId, body.gameId);
    if (game.config.teamId !== player.team_id)
      throw new LiveError("Choose a player from this game's team.", 400);
  }
  return player;
}
export async function assignPractice(
  session: CoachSession,
  body: {
    playerId: string;
    gameId?: string;
    scenarioId?: string;
    bundleId?: string;
    note?: string;
  },
) {
  if (session.role === "viewer")
    throw new LiveError("A coach assigns practice.", 403);
  if (typeof body?.bundleId === "string")
    return assignBundle(session, body as { playerId: string; gameId?: string; bundleId: string; note?: string });
  if (!body || !BACKUP_SCENARIOS.some((s) => s.id === body.scenarioId))
    throw new LiveError("Choose a player and practice activity.", 400);
  await resolvePlayerForAssignment(session, body);
  const row = {
    org_id: session.orgId,
    id: randomUUID(),
    player_id: body.playerId,
    game_id: body.gameId ?? null,
    scenario_id: body.scenarioId as string,
    note: body.note ?? "",
  };
  const { error: saveError } = await client()
    .from("training_assignments")
    .insert(row);
  if (saveError)
    throw new LiveError("Practice was not saved. Retry when connected.", 503);
  return row;
}
// Assigns a whole position-practice bundle (ordered set of scenario ids) to
// one player in a single coach action. A parent row in
// training_practice_bundles records the assignment; each scenario keeps its
// own training_assignments row (bundle_assignment_id/bundle_position link it
// back) so the existing per-scenario answer/result path is unchanged.
async function assignBundle(
  session: CoachSession,
  body: { playerId: string; gameId?: string; bundleId: string; note?: string },
) {
  const bundle = getPositionPracticeBundle(body.bundleId);
  if (!bundle) throw new LiveError("Choose a player and practice bundle.", 400);
  await resolvePlayerForAssignment(session, body);
  const bundleRow = {
    org_id: session.orgId,
    id: randomUUID(),
    player_id: body.playerId,
    game_id: body.gameId ?? null,
    bundle_id: bundle.id,
    note: body.note ?? "",
  };
  const { error: bundleError } = await client()
    .from("training_practice_bundles")
    .insert(bundleRow);
  if (bundleError)
    throw new LiveError("Practice was not saved. Retry when connected.", 503);
  const assignmentRows = bundle.scenarioIds.map((scenarioId, index) => ({
    org_id: session.orgId,
    id: randomUUID(),
    player_id: body.playerId,
    game_id: body.gameId ?? null,
    scenario_id: scenarioId,
    note: body.note ?? "",
    bundle_assignment_id: bundleRow.id,
    bundle_position: index,
  }));
  const { error: assignError } = await client()
    .from("training_assignments")
    .insert(assignmentRows);
  if (assignError)
    throw new LiveError(
      "The practice bundle was saved, but its activities were not. Retry when connected.",
      503,
    );
  return { bundleAssignment: bundleRow, assignments: assignmentRows };
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
    // Reveal the answer position only once the coach has answered correctly, so
    // the client never needs the answer pool to render the solved Diamond.
    targetZone: correct ? scenario.targetZone : null,
    duplicate: !!saveError,
  };
}
