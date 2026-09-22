import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameEventV2, TeamAtBat } from "@/lib/coach/game-types";
// Bundled at build time so it ships with serverless functions (e.g. Vercel),
// where the local data/ file is absent and the filesystem is read-only.
import seedDb from "@/lib/coach/seed-db.json";
import { isSupabaseEnabled, getSupabaseClient, type OrgScope } from "@/lib/supabase";

export type LocalDb = {
  teams: Array<{ id: string; name: string; normalizedName: string; createdAt: string }>;
  games: Array<{
    id: string;
    clientGameId: string;
    label: string;
    playedAt: string;
    opponentTeamId: string;
    usScore: number;
    opponentScore: number;
    source: "local_storage";
    schemaVersion: number;
    usAreHome: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
  playEvents: Array<{
    id: string;
    gameId: string;
    eventIndex: number;
    clientPinId: string;
    inning: number;
    batter: string;
    battingTeam: TeamAtBat;
    result: string;
    zone: string;
    x: number;
    y: number;
    eventType: string;
    eventTimestamp: string;
    description: string;
    outsAfter: number;
    usRunsAfter: number;
    opponentRunsAfter: number;
    basesAfter: { first: string | null; second: string | null; third: string | null };
    createdAt: string;
  }>;
};

const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "local-db.json");

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyDb(): LocalDb {
  return { teams: [], games: [], playEvents: [] };
}

function coerceDb(parsed: Partial<LocalDb>): LocalDb {
  return {
    teams: Array.isArray(parsed.teams) ? parsed.teams : [],
    games: Array.isArray(parsed.games) ? parsed.games : [],
    playEvents: Array.isArray(parsed.playEvents) ? parsed.playEvents : [],
  };
}

// ⚠️ Takes an OrgScope as of MT-2 (§3.4 Stage A). It is required rather than
// defaulted for the same reason sbSelectAll's is: a default would let a caller
// read another tenant's games by forgetting an argument, and the compiler
// would say nothing. Every caller is a route handler or server component that
// already awaits requireCoach(), so `await getOrgScope()` sits naturally
// beside it — and in MT-3 that line becomes `session.orgId` with no other
// change (T5).
//
// Fixture fallback is limited to unconfigured, non-production owner development.
// Configured databases and other tenants never receive bundled sample games.
export async function readDb(scope: OrgScope): Promise<LocalDb> {
  // Configured databases are authoritative: surface outages rather than substitute sample games.
  if (isSupabaseEnabled()) return readDbFromSupabase(scope);
  if (process.env.NODE_ENV === "production" || scope.orgId !== "org-outlaws")
    throw new Error("Historical game storage is unavailable.");
  // Local dev fallback: working-copy JSON file, else the bundled seed.
  try {
    const raw = await readFile(DB_FILE, "utf8");
    const db = coerceDb(JSON.parse(raw) as Partial<LocalDb>);
    if (db.games.length > 0) return db;
  } catch {
    // No local file (or unreadable) — fall through to the bundled seed.
  }
  return coerceDb(seedDb as Partial<LocalDb>);
}

type TeamRow = { id: string; name: string; normalized_name: string; created_at: string };
type GameRow = {
  id: string; client_game_id: string; label: string; played_at: string; opponent_team_id: string;
  us_score: number; opponent_score: number; source: string; schema_version: number;
  us_home?: boolean; created_at: string; updated_at: string;
};
type EventRow = {
  id: string; game_id: string; event_index: number; client_pin_id: string; inning: number;
  batter: string; batting_team: TeamAtBat; result: string; zone: string; x: number; y: number;
  event_type: string; event_timestamp: string | null; description: string; outs_after: number;
  us_runs_after: number; opponent_runs_after: number;
  bases_after: { first: string | null; second: string | null; third: string | null }; created_at: string;
};

async function historicalRows<T>(scope: OrgScope, table: "teams" | "games" | "play_events"): Promise<T[]> {
  if (!scope.orgId) throw new Error("Organization required");
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const {data,error} = await getSupabaseClient().from(table).select("*").eq("org_id",scope.orgId).order("id").range(offset,offset+499).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw new Error(`Historical ${table} read failed: ${error.message}`);
    rows.push(...(data ?? []) as T[]);
    if ((data ?? []).length < 500) return rows;
  }
}

async function readDbFromSupabase(scope: OrgScope): Promise<LocalDb> {
  // These three selects are the reason §2.3 denormalizes org_id onto
  // play_events rather than deriving it through games: this runs on every
  // dashboard load and pulls the entire event table, so the tenant predicate
  // has to be an index scan on one column, not a three-deep FK walk.
  const [teams, games, events] = await Promise.all([
    historicalRows<TeamRow>(scope, "teams"),
    historicalRows<GameRow>(scope, "games"),
    historicalRows<EventRow>(scope, "play_events"),
  ]);
  return {
    teams: teams.map((t) => ({
      id: t.id, name: t.name, normalizedName: t.normalized_name, createdAt: t.created_at,
    })),
    games: games.sort((a,b) => b.played_at.localeCompare(a.played_at)).map((g) => ({
      id: g.id, clientGameId: g.client_game_id, label: g.label, playedAt: g.played_at,
      opponentTeamId: g.opponent_team_id, usScore: g.us_score, opponentScore: g.opponent_score,
      source: "local_storage", schemaVersion: g.schema_version, usAreHome: g.us_home ?? false,
      createdAt: g.created_at, updatedAt: g.updated_at,
    })),
    playEvents: events.map((e) => ({
      id: e.id, gameId: e.game_id, eventIndex: e.event_index, clientPinId: e.client_pin_id, inning: e.inning,
      batter: e.batter, battingTeam: e.batting_team, result: e.result, zone: e.zone, x: e.x, y: e.y,
      eventType: e.event_type, eventTimestamp: e.event_timestamp || e.created_at, description: e.description,
      outsAfter: e.outs_after, usRunsAfter: e.us_runs_after, opponentRunsAfter: e.opponent_runs_after,
      basesAfter: e.bases_after || { first: null, second: null, third: null }, createdAt: e.created_at,
    })),
  };
}

export async function writeDb(db: LocalDb): Promise<void> {
  await mkdir(DB_DIR, { recursive: true });
  await writeFile(DB_FILE, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

export function normalizeTeamName(name?: string): string {
  const raw = (name || "Opponents").trim();
  return raw.length > 0 ? raw : "Opponents";
}

export function toV2EventFallback(row: LocalDb["playEvents"][number]): GameEventV2 {
  return {
    id: row.id,
    eventType: row.eventType === "pitch" ? "pitch" : "ball_in_play",
    timestamp: row.eventTimestamp || row.createdAt,
    inning: row.inning,
    batter: row.batter,
    battingTeam: row.battingTeam,
    result: row.result as GameEventV2["result"],
    zone: row.zone as GameEventV2["zone"],
    x: row.x,
    y: row.y,
    description: row.description || `${row.batter} ${row.result}`,
    stateAfter: {
      outs: typeof row.outsAfter === "number" ? row.outsAfter : 0,
      usRuns: typeof row.usRunsAfter === "number" ? row.usRunsAfter : 0,
      opponentRuns: typeof row.opponentRunsAfter === "number" ? row.opponentRunsAfter : 0,
      bases: row.basesAfter || { first: null, second: null, third: null },
    },
  };
}
