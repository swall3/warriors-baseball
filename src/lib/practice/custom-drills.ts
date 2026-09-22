import { randomUUID } from "node:crypto";
import type { CoachSession } from "@/lib/coach/session";
import { coachTeamIds } from "@/lib/access/policy";
import { client, LiveError } from "@/lib/coach/live/store";
import {
  AGE_BANDS,
  DRILL_CATEGORIES,
  EQUIPMENT_ITEMS,
  type AgeBand,
  type Drill,
  type DrillCategory,
  type EquipmentItem,
  type ScenarioCategory,
} from "./drills.ts";
import type { FieldPosition } from "./bundles.ts";

const POSITIONS: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const SCENARIO_CATEGORIES: ScenarioCategory[] = ["cover", "backup", "relay", "miss-recovery"];

type CustomDrillRow = {
  org_id: string;
  id: string;
  team_id: string;
  name: string;
  category: DrillCategory;
  positions: FieldPosition[];
  age_bands: AgeBand[];
  duration_minutes: number;
  players: string;
  space: string;
  equipment: EquipmentItem[];
  setup: string;
  instructions: string[];
  coaching_cue: string | null;
  scenario_category: ScenarioCategory | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamDrill = Drill & {
  teamId: string;
  source: "team";
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toDrill(row: CustomDrillRow): TeamDrill {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    positions: row.positions,
    ageBands: row.age_bands,
    durationMinutes: row.duration_minutes,
    players: row.players,
    space: row.space,
    equipment: row.equipment,
    setup: row.setup,
    instructions: row.instructions,
    coachingCue: row.coaching_cue ?? undefined,
    scenarioCategory: row.scenario_category ?? undefined,
    teamId: row.team_id,
    source: "team",
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertTeamAllowed(session: CoachSession, teamId: string) {
  const ids = coachTeamIds(session);
  if (ids !== null && !ids.includes(teamId))
    throw new LiveError("Choose a team you coach.", 403);
}

const text = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new LiveError(`${label} is required.`, 400);
  return value.trim();
};

function stringList<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
  allowEmpty = false,
): T[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0))
    throw new LiveError(`Choose at least one ${label}.`, 400);
  const items = [...new Set(value)];
  if (items.some((item) => typeof item !== "string" || !allowed.includes(item as T)))
    throw new LiveError(`Choose valid ${label}.`, 400);
  return items as T[];
}

function validateBody(body: Record<string, unknown>) {
  const duration = Number(body.durationMinutes);
  if (!Number.isInteger(duration) || duration < 1 || duration > 60)
    throw new LiveError("Duration must be between 1 and 60 minutes.", 400);
  if (!DRILL_CATEGORIES.includes(body.category as DrillCategory))
    throw new LiveError("Choose a drill category.", 400);
  if (
    body.scenarioCategory &&
    !SCENARIO_CATEGORIES.includes(body.scenarioCategory as ScenarioCategory)
  )
    throw new LiveError("Choose a valid game-situation focus.", 400);
  if (!Array.isArray(body.instructions) || body.instructions.length === 0 || body.instructions.length > 12)
    throw new LiveError("Add 1–12 instruction steps.", 400);
  const instructions = body.instructions.map((step, index) =>
    text(step, `Instruction ${index + 1}`, 500),
  );
  return {
    name: text(body.name, "Drill name", 160),
    category: body.category as DrillCategory,
    positions: stringList(body.positions, POSITIONS, "position", true),
    age_bands: stringList(body.ageBands, AGE_BANDS, "age group"),
    duration_minutes: duration,
    players: text(body.players, "Player setup", 300),
    space: text(body.space, "Practice space", 300),
    equipment: stringList(body.equipment, EQUIPMENT_ITEMS, "equipment item"),
    setup: text(body.setup, "Setup", 1200),
    instructions,
    coaching_cue:
      typeof body.coachingCue === "string" && body.coachingCue.trim()
        ? body.coachingCue.trim().slice(0, 500)
        : null,
    scenario_category: (body.scenarioCategory as ScenarioCategory | undefined) ?? null,
  };
}

export async function listCustomDrills(
  session: CoachSession,
  teamId?: string,
  includeArchived = false,
) {
  if (teamId) await assertTeamAllowed(session, teamId);
  let query = client()
    .from("custom_practice_drills")
    .select("*")
    .eq("org_id", session.orgId)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (teamId) query = query.eq("team_id", teamId);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new LiveError("Team drills are unavailable. Retry when connected.", 503);
  const ids = coachTeamIds(session);
  return ((data ?? []) as CustomDrillRow[])
    .filter((row) => ids === null || ids.includes(row.team_id))
    .map(toDrill);
}

export async function getCustomDrill(session: CoachSession, id: string) {
  const { data, error } = await client()
    .from("custom_practice_drills")
    .select("*")
    .eq("org_id", session.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new LiveError("Team drill is unavailable. Retry when connected.", 503);
  if (!data) throw new LiveError("Team drill not found.", 404);
  await assertTeamAllowed(session, (data as CustomDrillRow).team_id);
  return toDrill(data as CustomDrillRow);
}

export async function validCustomDrillIds(
  session: CoachSession,
  teamId: string,
  ids: string[],
) {
  if (!ids.length) return new Set<string>();
  await assertTeamAllowed(session, teamId);
  const { data, error } = await client()
    .from("custom_practice_drills")
    .select("id")
    .eq("org_id", session.orgId)
    .eq("team_id", teamId)
    .is("archived_at", null)
    .in("id", ids);
  if (error) throw new LiveError("Team drills are unavailable. Retry when connected.", 503);
  return new Set((data ?? []).map((row) => row.id as string));
}

export async function createCustomDrill(
  session: CoachSession,
  body: Record<string, unknown>,
) {
  if (session.role === "viewer") throw new LiveError("A coach creates team drills.", 403);
  const teamId = text(body.teamId, "Team", 160);
  await assertTeamAllowed(session, teamId);
  const row = {
    org_id: session.orgId,
    id: `custom-${randomUUID()}`,
    team_id: teamId,
    ...validateBody(body),
    created_by: session.userId ?? null,
  };
  const { data, error } = await client()
    .from("custom_practice_drills")
    .insert(row)
    .select("*")
    .single();
  if (error) throw new LiveError("The team drill was not saved. Retry when connected.", 503);
  return toDrill(data as CustomDrillRow);
}

export async function updateCustomDrill(
  session: CoachSession,
  id: string,
  body: Record<string, unknown>,
) {
  if (session.role === "viewer") throw new LiveError("A coach edits team drills.", 403);
  const existing = await getCustomDrill(session, id);
  const { data, error } = await client()
    .from("custom_practice_drills")
    .update({ ...validateBody({ ...existing, ...body }), updated_at: new Date().toISOString() })
    .eq("org_id", session.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new LiveError("The team drill was not saved. Retry when connected.", 503);
  if (!data) throw new LiveError("Team drill not found.", 404);
  return toDrill(data as CustomDrillRow);
}

export async function setCustomDrillArchived(
  session: CoachSession,
  id: string,
  archived: boolean,
) {
  if (session.role === "viewer") throw new LiveError("A coach edits team drills.", 403);
  await getCustomDrill(session, id);
  const { data, error } = await client()
    .from("custom_practice_drills")
    .update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("org_id", session.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new LiveError("The team drill was not updated. Retry when connected.", 503);
  if (!data) throw new LiveError("Team drill not found.", 404);
  return toDrill(data as CustomDrillRow);
}
