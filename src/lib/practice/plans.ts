// Custom team practice plans (Decision 2, MVP scope item 3). Preloaded
// drills/templates stay in code (drills.ts, templates.ts); only
// coach-authored plans persist here, in practice_plans
// (supabase/migrations/20260922180000_practice_plans.sql).
//
// Follows the same server-only-persistence shape as
// src/lib/coach/live/training-store.ts: a CoachSession-scoped query, org_id
// always in the where clause, team access enforced with coachTeamIds.
import { randomUUID } from "node:crypto";
import type { CoachSession } from "@/lib/coach/session";
import { coachTeamIds } from "@/lib/access/policy";
import { client, LiveError } from "@/lib/coach/live/store";
import { getDrill } from "./drills.ts";
import { getPracticeTemplate, type PracticeBlock } from "./templates.ts";
import { totalPlanDuration, unresolvedDrillIds } from "./aggregate.ts";

export type PracticePlan = {
  org_id: string;
  id: string;
  team_id: string;
  name: string;
  description: string;
  source_template_id: string | null;
  blocks: PracticeBlock[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_BLOCKS = 20;
const MAX_DRILLS_PER_BLOCK = 12;
const MAX_BLOCK_DURATION = 8 * 60; // 8 hours — generous ceiling, not a real cap

function validateBlocks(input: unknown): PracticeBlock[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_BLOCKS)
    throw new LiveError("A practice plan needs at least one station.", 400);
  return input.map((raw, index) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof (raw as { label?: unknown }).label !== "string" ||
      !(raw as { label: string }).label.trim() ||
      typeof (raw as { durationMinutes?: unknown }).durationMinutes !== "number" ||
      !Number.isFinite((raw as { durationMinutes: number }).durationMinutes) ||
      (raw as { durationMinutes: number }).durationMinutes <= 0 ||
      (raw as { durationMinutes: number }).durationMinutes > MAX_BLOCK_DURATION ||
      !Array.isArray((raw as { drillIds?: unknown }).drillIds)
    )
      throw new LiveError(`Station ${index + 1} is missing a label, duration, or drills.`, 400);
    const block = raw as { label: string; durationMinutes: number; drillIds: unknown[]; id?: unknown };
    if (block.drillIds.length === 0 || block.drillIds.length > MAX_DRILLS_PER_BLOCK)
      throw new LiveError(`Station "${block.label}" needs 1-${MAX_DRILLS_PER_BLOCK} drills.`, 400);
    const drillIds = block.drillIds.map((id) => {
      if (typeof id !== "string" || !getDrill(id))
        throw new LiveError(`Station "${block.label}" references an unknown drill.`, 400);
      return id;
    });
    return {
      id: typeof block.id === "string" && block.id ? block.id : randomUUID(),
      label: block.label.trim().slice(0, 120),
      durationMinutes: Math.round(block.durationMinutes),
      drillIds,
    };
  });
}

async function assertTeamAllowed(session: CoachSession, teamId: string) {
  const ids = coachTeamIds(session);
  if (ids !== null && !ids.includes(teamId))
    throw new LiveError("Choose a team you coach.", 403);
}

export async function listPlans(session: CoachSession, teamId?: string) {
  let query = client()
    .from("practice_plans")
    .select("*")
    .eq("org_id", session.orgId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error } = await query;
  if (error) throw new LiveError("Practice plans are unavailable. Retry when connected.", 503);
  const ids = coachTeamIds(session);
  const rows = (data ?? []) as PracticePlan[];
  return ids === null ? rows : rows.filter((r) => ids.includes(r.team_id));
}

export async function getPlan(session: CoachSession, id: string) {
  const { data, error } = await client()
    .from("practice_plans")
    .select("*")
    .eq("org_id", session.orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new LiveError("Practice plan is unavailable. Retry when connected.", 503);
  if (!data) throw new LiveError("Practice plan not found.", 404);
  await assertTeamAllowed(session, (data as PracticePlan).team_id);
  return data as PracticePlan;
}

export async function createPlan(
  session: CoachSession,
  body: {
    teamId?: string;
    name?: string;
    description?: string;
    sourceTemplateId?: string;
    blocks?: unknown;
  },
) {
  if (session.role === "viewer") throw new LiveError("A coach builds practice plans.", 403);
  if (!body || typeof body.teamId !== "string" || !body.teamId)
    throw new LiveError("Choose a team for this practice plan.", 400);
  await assertTeamAllowed(session, body.teamId);
  if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200)
    throw new LiveError("Give the practice plan a name.", 400);
  if (
    body.sourceTemplateId !== undefined &&
    body.sourceTemplateId !== null &&
    (typeof body.sourceTemplateId !== "string" || !getPracticeTemplate(body.sourceTemplateId))
  )
    throw new LiveError("Unknown practice template.", 400);
  if (body.description !== undefined && typeof body.description !== "string")
    throw new LiveError("Invalid description.", 400);
  const blocks = validateBlocks(body.blocks);
  const row = {
    org_id: session.orgId,
    id: randomUUID(),
    team_id: body.teamId,
    name: body.name.trim(),
    description: (body.description ?? "").slice(0, 2000),
    source_template_id: body.sourceTemplateId ?? null,
    blocks,
    created_by: session.userId ?? null,
  };
  const { error } = await client().from("practice_plans").insert(row);
  if (error) throw new LiveError("The practice plan was not saved. Retry when connected.", 503);
  return row;
}

export async function updatePlan(
  session: CoachSession,
  id: string,
  body: { name?: string; description?: string; blocks?: unknown },
) {
  if (session.role === "viewer") throw new LiveError("A coach edits practice plans.", 403);
  const existing = await getPlan(session, id);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 200)
      throw new LiveError("Give the practice plan a name.", 400);
    patch.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string")
      throw new LiveError("Invalid description.", 400);
    patch.description = body.description.slice(0, 2000);
  }
  if (body.blocks !== undefined) patch.blocks = validateBlocks(body.blocks);
  const { data, error } = await client()
    .from("practice_plans")
    .update(patch)
    .eq("org_id", session.orgId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new LiveError("The practice plan was not saved. Retry when connected.", 503);
  if (!data) throw new LiveError("Practice plan not found.", 404);
  return { ...existing, ...(data as PracticePlan) };
}

export async function deletePlan(session: CoachSession, id: string) {
  if (session.role === "viewer") throw new LiveError("A coach deletes practice plans.", 403);
  await getPlan(session, id);
  const { error } = await client()
    .from("practice_plans")
    .delete()
    .eq("org_id", session.orgId)
    .eq("id", id);
  if (error) throw new LiveError("The practice plan was not deleted. Retry when connected.", 503);
  return { ok: true };
}

// Builds the create-plan payload for "clone this template" — a plan builder
// convenience so the client doesn't have to re-derive block ids/durations
// from templates.ts itself.
export function planFromTemplate(templateId: string, teamId: string) {
  const template = getPracticeTemplate(templateId);
  if (!template) throw new LiveError("Unknown practice template.", 400);
  return {
    teamId,
    name: template.name,
    description: template.description,
    sourceTemplateId: template.id,
    blocks: template.blocks.map((b) => ({ ...b, id: randomUUID() })),
  };
}

export { totalPlanDuration, unresolvedDrillIds };
