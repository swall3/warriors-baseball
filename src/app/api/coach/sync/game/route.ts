import { sessionFor, failure } from "@/lib/coach/live/http";
import { LiveError } from "@/lib/coach/live/store";
import { NextResponse } from "next/server";
import type { GameEventV2, PersistedGamePayload } from "@/lib/coach/game-types";
import {
  readScoreUs,
  readStateUsRuns,
  readUsAreHome,
  toTeamAtBat,
} from "@/lib/coach/game-types";
import {
  makeId,
  normalizeTeamName,
  readDb,
  writeDb,
} from "@/lib/coach/local-db";
import {
  isSupabaseEnabled,
  getSupabaseClient,
  type OrgScope,
} from "@/lib/supabase";
import { validateHistoricalGame } from "@/lib/coach/validate-historical";

function toV2Events(game: PersistedGamePayload): GameEventV2[] {
  if (Array.isArray(game.eventsV2) && game.eventsV2.length > 0)
    return game.eventsV2;
  return game.pins.map((pin, index) => ({
    id: `legacy-${pin.id}-${index}`,
    eventType: "ball_in_play",
    timestamp: game.date,
    inning: pin.inning ?? 1,
    batter: pin.batter || "",
    battingTeam: toTeamAtBat(pin.battingTeam),
    result: pin.result,
    zone: pin.zone,
    x: pin.x,
    y: pin.y,
    description: `${pin.batter || "Batter"} ${pin.result.replaceAll("_", " ")}`,
    stateAfter: {
      outs: 0,
      usRuns: readScoreUs(game.score) ?? 0,
      opponentRuns: game.score?.opponents ?? 0,
      bases: { first: null, second: null, third: null },
    },
  }));
}

export async function POST(request: Request) {
  let session;
  try {
    session = await sessionFor(request, true);
    if (session.role === "viewer")
      throw new LiveError("Only coaches can save game data.", 403);
  } catch (e) {
    return failure(e);
  }
  try {
    const body = (await request.json()) as { game?: PersistedGamePayload };
    const game = body?.game;
    if (!game || !game.id || !Array.isArray(game.pins)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 },
      );
    }

    validateHistoricalGame(game);
    if (isSupabaseEnabled()) {
      return await syncToSupabase(game, { orgId: session.orgId });
    }
    return await syncToLocalFile(game, { orgId: session.orgId });
  } catch (error) {
    return failure(error);
  }
}

// Cross-device path: targeted upserts. NEVER rewrite the whole DB — that would
// let two phones syncing different games clobber each other.
async function syncToSupabase(game: PersistedGamePayload, scope: OrgScope) {
  const now = new Date().toISOString();
  const opponentTeamName = normalizeTeamName(game.opponentTeamName);
  const eventsV2 = toV2Events(game);
  const eventRows = eventsV2.map((event, index) => ({
    id: makeId("evt"),
    event_index: index,
    client_pin_id: event.id,
    inning: event.inning ?? 1,
    batter: event.batter || "",
    batting_team: toTeamAtBat(event.battingTeam),
    result: event.result || "single",
    zone: event.zone || "",
    x: event.x,
    y: event.y,
    event_type: event.eventType || "ball_in_play",
    event_timestamp: event.timestamp || now,
    description: event.description || `${event.batter} ${event.result}`,
    outs_after: event.stateAfter?.outs ?? 0,
    us_runs_after:
      readStateUsRuns(event.stateAfter) ?? readScoreUs(game.score) ?? 0,
    opponent_runs_after:
      event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    bases_after: event.stateAfter?.bases || {
      first: null,
      second: null,
      third: null,
    },
    created_at: now,
  }));
  const { data, error } = await getSupabaseClient()
    .rpc("sync_historical_game", {
      p_org: scope.orgId,
      p_game: {
        client_game_id: game.id,
        label: game.label || `${opponentTeamName} game`,
        played_at: game.date || now,
        opponent_name: opponentTeamName,
        us_score: readScoreUs(game.score) ?? 0,
        opponent_score: game.score?.opponents ?? 0,
        schema_version: game.schemaVersion ?? 2,
        us_home: readUsAreHome(game) ?? false,
      },
      p_events: eventRows,
    })
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    console.error("[historical-sync] transaction failed", error.message);
    throw new LiveError(
      "Game sync was not confirmed. Your device copy is safe; retry when connected.",
      503,
    );
  }
  return NextResponse.json(
    { ok: true, ...data },
    { headers: { "Cache-Control": "no-store, private" } },
  );
}

// Local-dev fallback: single JSON file (original behavior). Takes the same
// scope as syncToSupabase so the two paths keep identical signatures and a
// reader does not conclude that one of them is exempt from tenancy — it is
// passed straight to readDb. data/local-db.json is a single-tenant development
// fixture that never holds another org's rows, so nothing below filters on it.
async function syncToLocalFile(game: PersistedGamePayload, scope: OrgScope) {
  const now = new Date().toISOString();
  const opponentTeamName = normalizeTeamName(game.opponentTeamName);
  const normalizedName = opponentTeamName.toLowerCase();
  const db = await readDb(scope);

  let team = db.teams.find((t) => t.normalizedName === normalizedName);
  if (!team) {
    team = {
      id: makeId("team"),
      name: opponentTeamName,
      normalizedName,
      createdAt: now,
    };
    db.teams.push(team);
  } else if (team.name !== opponentTeamName) {
    team.name = opponentTeamName;
  }

  let storedGame = db.games.find((g) => g.clientGameId === game.id);
  if (!storedGame) {
    storedGame = {
      id: makeId("game"),
      clientGameId: game.id,
      label: game.label || `${opponentTeamName} game`,
      playedAt: game.date || now,
      opponentTeamId: team.id,
      usScore: readScoreUs(game.score) ?? 0,
      opponentScore: game.score?.opponents ?? 0,
      source: "local_storage",
      schemaVersion: game.schemaVersion ?? 2,
      usAreHome: readUsAreHome(game) ?? false,
      createdAt: now,
      updatedAt: now,
    };
    db.games.push(storedGame);
  } else {
    storedGame.label = game.label || storedGame.label;
    storedGame.playedAt = game.date || storedGame.playedAt;
    storedGame.opponentTeamId = team.id;
    storedGame.usScore = readScoreUs(game.score) ?? storedGame.usScore;
    storedGame.opponentScore =
      game.score?.opponents ?? storedGame.opponentScore;
    storedGame.schemaVersion =
      game.schemaVersion ?? storedGame.schemaVersion ?? 2;
    storedGame.usAreHome = readUsAreHome(game) ?? storedGame.usAreHome ?? false;
    storedGame.updatedAt = now;
  }

  const eventsV2 = toV2Events(game);
  db.playEvents = db.playEvents.filter((e) => e.gameId !== storedGame.id);
  const eventRows = eventsV2.map((event, index) => ({
    id: makeId("evt"),
    gameId: storedGame.id,
    eventIndex: index,
    clientPinId: event.id,
    inning: event.inning ?? 1,
    batter: event.batter || "",
    battingTeam: toTeamAtBat(event.battingTeam),
    result: event.result || "single",
    zone: event.zone || "",
    x: event.x,
    y: event.y,
    eventType: event.eventType || "ball_in_play",
    eventTimestamp: event.timestamp || now,
    description: event.description || `${event.batter} ${event.result}`,
    outsAfter: event.stateAfter?.outs ?? 0,
    usRunsAfter:
      readStateUsRuns(event.stateAfter) ?? readScoreUs(game.score) ?? 0,
    opponentRunsAfter:
      event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    basesAfter: event.stateAfter?.bases || {
      first: null,
      second: null,
      third: null,
    },
    createdAt: now,
  }));
  db.playEvents.push(...eventRows);

  await writeDb(db);
  return NextResponse.json({
    ok: true,
    gameId: storedGame.clientGameId,
    syncedEvents: eventRows.length,
  });
}
