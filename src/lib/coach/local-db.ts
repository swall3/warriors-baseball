import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GameEventV2, TeamAtBat } from "@/lib/coach/game-types";
// Bundled at build time so it ships with serverless functions (e.g. Vercel),
// where the local data/ file is absent and the filesystem is read-only.
import seedDb from "@/lib/coach/seed-db.json";
import { isSupabaseEnabled, sbSelectAll } from "@/lib/supabase";

export type LocalDb = {
  teams: Array<{ id: string; name: string; normalizedName: string; createdAt: string }>;
  games: Array<{
    id: string;
    clientGameId: string;
    label: string;
    playedAt: string;
    opponentTeamId: string;
    outlawsScore: number;
    opponentScore: number;
    source: "local_storage";
    schemaVersion: number;
    outlawsAreHome: boolean;
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
    outlawsRunsAfter: number;
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

export async function readDb(): Promise<LocalDb> {
  // Primary source: shared Supabase DB (real cross-device data).
  if (isSupabaseEnabled()) {
    try {
      return await readDbFromSupabase();
    } catch (error) {
      // B1 fix: Supabase being *configured* doesn't mean it's *reachable*
      // (paused project, network blip, etc). Previously this threw straight
      // through to a 500 on every data screen. Now it degrades to the local
      // fallback below instead of taking the whole read path down.
      console.error("Supabase read failed, falling back to local/seed data", error);
    }
  }
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
  outlaws_score: number; opponent_score: number; source: string; schema_version: number;
  outlaws_home?: boolean; created_at: string; updated_at: string;
};
type EventRow = {
  id: string; game_id: string; event_index: number; client_pin_id: string; inning: number;
  batter: string; batting_team: TeamAtBat; result: string; zone: string; x: number; y: number;
  event_type: string; event_timestamp: string | null; description: string; outs_after: number;
  outlaws_runs_after: number; opponent_runs_after: number;
  bases_after: { first: string | null; second: string | null; third: string | null }; created_at: string;
};

async function readDbFromSupabase(): Promise<LocalDb> {
  const [teams, games, events] = await Promise.all([
    sbSelectAll<TeamRow>("teams"),
    sbSelectAll<GameRow>("games", "select=*&order=played_at.desc"),
    sbSelectAll<EventRow>("play_events", "select=*&order=event_index.asc"),
  ]);
  return {
    teams: teams.map((t) => ({
      id: t.id, name: t.name, normalizedName: t.normalized_name, createdAt: t.created_at,
    })),
    games: games.map((g) => ({
      id: g.id, clientGameId: g.client_game_id, label: g.label, playedAt: g.played_at,
      opponentTeamId: g.opponent_team_id, outlawsScore: g.outlaws_score, opponentScore: g.opponent_score,
      source: "local_storage", schemaVersion: g.schema_version, outlawsAreHome: g.outlaws_home ?? false,
      createdAt: g.created_at, updatedAt: g.updated_at,
    })),
    playEvents: events.map((e) => ({
      id: e.id, gameId: e.game_id, eventIndex: e.event_index, clientPinId: e.client_pin_id, inning: e.inning,
      batter: e.batter, battingTeam: e.batting_team, result: e.result, zone: e.zone, x: e.x, y: e.y,
      eventType: e.event_type, eventTimestamp: e.event_timestamp || e.created_at, description: e.description,
      outsAfter: e.outs_after, outlawsRunsAfter: e.outlaws_runs_after, opponentRunsAfter: e.opponent_runs_after,
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
    eventType: "ball_in_play",
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
      outlawsRuns: typeof row.outlawsRunsAfter === "number" ? row.outlawsRunsAfter : 0,
      opponentRuns: typeof row.opponentRunsAfter === "number" ? row.opponentRunsAfter : 0,
      bases: row.basesAfter || { first: null, second: null, third: null },
    },
  };
}
