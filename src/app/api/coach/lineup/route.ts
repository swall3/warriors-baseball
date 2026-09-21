// GET/POST /api/coach/lineup — server-side persistence for the defense
// rotation plan (MERGE-PLAN.md Phase 3). Requires migration
// supabase/migrations/004_lineup_plans.sql to have been applied.
//
// Same shape as the other ported /api/coach routes: requireCoach() at the top
// of every handler (defence in depth behind middleware.ts), the @/lib/supabase
// shim for all queries, and never a 5xx for a condition the client can handle.
import { NextResponse } from "next/server";
import { requireCoach } from "@/lib/coach/auth";
import { isSupabaseEnabled, sbSelectAll, sbUpsert, type OrgScope } from "@/lib/supabase";
import { getOrgScope } from "@/lib/tenant/context";
import {
  normalizeFormat,
  normalizeGroups,
  normalizeInningMap,
  type LineupPlan,
} from "@/lib/coach/lineup";

const TABLE = "lineup_plans";

type LineupPlanRow = {
  id: string;
  game_id: string | null;
  team_id: string;
  label: string;
  format: string;
  batting_order: unknown;
  groups: unknown;
  inning_map: unknown;
  updated_at: string;
};

// The DB stores `games.id` (internal), while every client only ever knows
// `games.client_game_id`. Resolve one to the other, returning null when the
// game hasn't been synced yet — a plan built before the game exists is a
// normal case, which is why lineup_plans.game_id is nullable.
async function resolveGameRowId(scope: OrgScope, clientGameId: string | null): Promise<string | null> {
  if (!clientGameId) return null;
  const rows = await sbSelectAll<{ id: string }>(
    scope,
    "games",
    `client_game_id=eq.${encodeURIComponent(clientGameId)}&select=id`,
  );
  return rows[0]?.id ?? null;
}

async function clientGameIdFor(scope: OrgScope, rowId: string | null): Promise<string | null> {
  if (!rowId) return null;
  const rows = await sbSelectAll<{ client_game_id: string }>(
    scope,
    "games",
    `id=eq.${encodeURIComponent(rowId)}&select=client_game_id`,
  );
  return rows[0]?.client_game_id ?? null;
}

async function rowToPlan(scope: OrgScope, row: LineupPlanRow): Promise<LineupPlan> {
  return {
    id: row.id,
    gameId: await clientGameIdFor(scope, row.game_id),
    teamId: row.team_id,
    label: row.label,
    format: normalizeFormat(row.format),
    battingOrder: Array.isArray(row.batting_order)
      ? (row.batting_order as unknown[]).filter((v): v is string => typeof v === "string")
      : [],
    groups: normalizeGroups(row.groups),
    inningMap: normalizeInningMap(row.inning_map),
    updatedAt: row.updated_at,
  };
}

// GET /api/coach/lineup?id=<planId>   — fetch one plan by its client-owned id
// GET /api/coach/lineup?gameId=<clientGameId> — fetch the plan for a game
// GET /api/coach/lineup               — list plans for the team (newest first)
export async function GET(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Not an error: local-only operation is the supported degraded mode. The
  // client keeps its localStorage plan and simply shows "local only".
  if (!isSupabaseEnabled()) {
    return NextResponse.json({ ok: true, plan: null, plans: [], persisted: false });
  }

  try {
    const scope = await getOrgScope();
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const gameId = url.searchParams.get("gameId");
    const teamId = url.searchParams.get("teamId");

    if (id) {
      const rows = await sbSelectAll<LineupPlanRow>(
        scope,
        TABLE,
        `id=eq.${encodeURIComponent(id)}&select=*`,
      );
      const plan = rows[0] ? await rowToPlan(scope, rows[0]) : null;
      return NextResponse.json({ ok: true, plan, persisted: true });
    }

    if (gameId) {
      const gameRowId = await resolveGameRowId(scope, gameId);
      // The game isn't in the DB yet, so no plan can be attached to it.
      if (!gameRowId) return NextResponse.json({ ok: true, plan: null, persisted: true });
      const rows = await sbSelectAll<LineupPlanRow>(
        scope,
        TABLE,
        `game_id=eq.${encodeURIComponent(gameRowId)}&select=*&order=updated_at.desc`,
      );
      const plan = rows[0] ? await rowToPlan(scope, rows[0]) : null;
      return NextResponse.json({ ok: true, plan, persisted: true });
    }

    // T6: a missing tenant key is a 400, not a default.
    //
    // This used to be `|| DEFAULT_TEAM_ID`. A GET with no teamId listed tenant
    // #1's plans, which under one tenant looked like a convenience and under
    // two is a cross-tenant read. The fix is not to substitute the caller's
    // org's own team — that would be the same silent guess with better
    // manners. The client always knows which team it is asking about; a
    // request that does not is a bug in the caller and should say so
    // (MULTI-TENANT-PLAN §0.3 T6).
    if (!teamId) {
      return NextResponse.json(
        { ok: false, error: "teamId is required" },
        { status: 400 },
      );
    }

    const rows = await sbSelectAll<LineupPlanRow>(
      scope,
      TABLE,
      `team_id=eq.${encodeURIComponent(teamId)}&select=*&order=updated_at.desc`,
    );
    const plans = await Promise.all(rows.map((row) => rowToPlan(scope, row)));
    return NextResponse.json({ ok: true, plans, plan: plans[0] ?? null, persisted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lineup plan";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// POST /api/coach/lineup — upsert a plan by its client-owned `id`.
//
// The client owns the id so the same plan round-trips across devices without a
// server round-trip first, and so an offline edit can be replayed later without
// creating a duplicate row.
export async function POST(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { plan?: Partial<LineupPlan> };
    const plan = body?.plan;
    if (!plan || typeof plan.id !== "string" || !plan.id) {
      return NextResponse.json({ ok: false, error: "Invalid payload: plan.id required" }, { status: 400 });
    }

    if (!isSupabaseEnabled()) {
      // 503, not 500: nothing is broken, the server just has no database
      // configured. db-sync's caller treats any non-ok as non-blocking.
      return NextResponse.json(
        { ok: false, error: "Supabase is not configured", persisted: false },
        { status: 503 },
      );
    }

    // T6: same rule on the write side, and it matters more here. This used to
    // be `plan.teamId || DEFAULT_TEAM_ID`, so a payload with no teamId WROTE a
    // row into tenant #1's data. Under multi-tenancy a missing tenant key must
    // be a 400 (MULTI-TENANT-PLAN §0.3 T6).
    //
    // Checked before the upsert rather than inside it so the client gets a 400
    // it can act on instead of a 500 from a null-violating insert.
    if (!plan.teamId) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload: plan.teamId required" },
        { status: 400 },
      );
    }

    const scope = await getOrgScope();
    const now = new Date().toISOString();
    const gameRowId = await resolveGameRowId(scope, plan.gameId ?? null);

    await sbUpsert(
      scope,
      TABLE,
      [
        {
          id: plan.id,
          game_id: gameRowId,
          team_id: plan.teamId,
          label: plan.label || "Game plan",
          format: normalizeFormat(plan.format),
          batting_order: Array.isArray(plan.battingOrder) ? plan.battingOrder : [],
          groups: normalizeGroups(plan.groups),
          inning_map: normalizeInningMap(plan.inningMap),
          // Explicit: the column default only fires on INSERT, so an update
          // would otherwise keep the original timestamp forever.
          updated_at: now,
        },
      ],
      // ⚠️ "org_id,id", not "id", and this is the one that mattered most.
      //
      // `plan.id` arrives in the REQUEST BODY — the client owns it on purpose,
      // so an offline edit can be replayed without creating a duplicate row.
      // Against the old global lineup_plans_pkey PRIMARY KEY (id), an upsert
      // naming another org's plan id would have had ON CONFLICT fire and
      // UPDATE that row, carrying this request's stamped org_id with it: org
      // A's plan overwritten and re-tenanted to org B. sbUpsert's org filter
      // cannot prevent that, because WHERE has no bearing on ON CONFLICT
      // target resolution (011 §3, generalized). 012's composite FKs do not
      // catch it either — org B's (org_id, team_id) pair is internally
      // consistent — and 013's policies are inert on this path.
      //
      // Migration 014 rebuilt the primary key as (org_id, id) so the plan-id
      // namespace is per tenant, and this is the matching call site.
      "org_id,id",
    );

    return NextResponse.json({ ok: true, id: plan.id, updatedAt: now, persisted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save lineup plan";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
