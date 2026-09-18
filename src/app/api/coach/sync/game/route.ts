import { NextResponse } from "next/server";
import type { GameEventV2, PersistedGamePayload } from "@/lib/coach/game-types";
import { makeId, normalizeTeamName, readDb, writeDb } from "@/lib/coach/local-db";
import { isSupabaseEnabled, sbDelete, sbInsert, sbSelectAll, sbUpsert } from "@/lib/supabase";
import { requireCoach } from "@/lib/coach/auth";

function toV2Events(game: PersistedGamePayload): GameEventV2[] {
  if (Array.isArray(game.eventsV2) && game.eventsV2.length > 0) return game.eventsV2;
  return game.pins.map((pin, index) => ({
    id: `legacy-${pin.id}-${index}`,
    eventType: "ball_in_play",
    timestamp: game.date,
    inning: pin.inning ?? 1,
    batter: pin.batter || "",
    battingTeam: pin.battingTeam === "opponent" ? "opponent" : "outlaws",
    result: pin.result,
    zone: pin.zone,
    x: pin.x,
    y: pin.y,
    description: `${pin.batter || "Batter"} ${pin.result.replaceAll("_", " ")}`,
    stateAfter: {
      outs: 0,
      outlawsRuns: game.score?.outlaws ?? 0,
      opponentRuns: game.score?.opponents ?? 0,
      bases: { first: null, second: null, third: null },
    },
  }));
}

export async function POST(request: Request) {
  if (!(await requireCoach())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as { game?: PersistedGamePayload };
    const game = body?.game;
    if (!game || !game.id || !Array.isArray(game.pins)) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }

    if (isSupabaseEnabled()) {
      return await syncToSupabase(game);
    }
    return await syncToLocalFile(game);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Cross-device path: targeted upserts. NEVER rewrite the whole DB — that would
// let two phones syncing different games clobber each other.
async function syncToSupabase(game: PersistedGamePayload) {
  const now = new Date().toISOString();
  const opponentTeamName = normalizeTeamName(game.opponentTeamName);
  const normalizedName = opponentTeamName.toLowerCase();

  // 1) Resolve/create the opponent team by its unique normalized name.
  const existingTeams = await sbSelectAll<{ id: string }>(
    "teams",
    `normalized_name=eq.${encodeURIComponent(normalizedName)}&select=id`,
  );
  let teamId = existingTeams[0]?.id;
  if (!teamId) {
    teamId = makeId("team");
    await sbInsert("teams", [
      { id: teamId, name: opponentTeamName, normalized_name: normalizedName, created_at: now },
    ]);
  } else {
    // Keep the display name fresh without touching the id.
    await sbUpsert("teams", [{ id: teamId, name: opponentTeamName, normalized_name: normalizedName }], "id");
  }

  // 2) Resolve/create the game by its client id; preserve the existing row id.
  const existingGames = await sbSelectAll<{ id: string }>(
    "games",
    `client_game_id=eq.${encodeURIComponent(game.id)}&select=id`,
  );
  const gameId = existingGames[0]?.id ?? makeId("game");
  await sbUpsert(
    "games",
    [
      {
        id: gameId,
        client_game_id: game.id,
        label: game.label || `${opponentTeamName} game`,
        played_at: game.date || now,
        opponent_team_id: teamId,
        outlaws_score: game.score?.outlaws ?? 0,
        opponent_score: game.score?.opponents ?? 0,
        source: "local_storage",
        schema_version: game.schemaVersion ?? 2,
        outlaws_home: game.outlawsAreHome ?? false,
        updated_at: now,
      },
    ],
    "client_game_id",
  );

  // 3) Replace this game's events only (scoped delete + insert).
  const eventsV2 = toV2Events(game);
  await sbDelete("play_events", `game_id=eq.${encodeURIComponent(gameId)}`);
  const eventRows = eventsV2.map((event, index) => ({
    id: makeId("evt"),
    game_id: gameId,
    event_index: index,
    client_pin_id: event.id,
    inning: event.inning ?? 1,
    batter: event.batter || "",
    batting_team: event.battingTeam === "opponent" ? "opponent" : "outlaws",
    result: event.result || "single",
    zone: event.zone || "",
    x: event.x,
    y: event.y,
    event_type: event.eventType || "ball_in_play",
    event_timestamp: event.timestamp || now,
    description: event.description || `${event.batter} ${event.result}`,
    outs_after: event.stateAfter?.outs ?? 0,
    outlaws_runs_after: event.stateAfter?.outlawsRuns ?? game.score?.outlaws ?? 0,
    opponent_runs_after: event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    bases_after: event.stateAfter?.bases || { first: null, second: null, third: null },
    created_at: now,
  }));
  await sbInsert("play_events", eventRows);

  return NextResponse.json({ ok: true, gameId: game.id, syncedEvents: eventRows.length });
}

// Local-dev fallback: single JSON file (original behavior).
async function syncToLocalFile(game: PersistedGamePayload) {
  const now = new Date().toISOString();
  const opponentTeamName = normalizeTeamName(game.opponentTeamName);
  const normalizedName = opponentTeamName.toLowerCase();
  const db = await readDb();

  let team = db.teams.find((t) => t.normalizedName === normalizedName);
  if (!team) {
    team = { id: makeId("team"), name: opponentTeamName, normalizedName, createdAt: now };
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
      outlawsScore: game.score?.outlaws ?? 0,
      opponentScore: game.score?.opponents ?? 0,
      source: "local_storage",
      schemaVersion: game.schemaVersion ?? 2,
      outlawsAreHome: game.outlawsAreHome ?? false,
      createdAt: now,
      updatedAt: now,
    };
    db.games.push(storedGame);
  } else {
    storedGame.label = game.label || storedGame.label;
    storedGame.playedAt = game.date || storedGame.playedAt;
    storedGame.opponentTeamId = team.id;
    storedGame.outlawsScore = game.score?.outlaws ?? storedGame.outlawsScore;
    storedGame.opponentScore = game.score?.opponents ?? storedGame.opponentScore;
    storedGame.schemaVersion = game.schemaVersion ?? storedGame.schemaVersion ?? 2;
    storedGame.outlawsAreHome = game.outlawsAreHome ?? storedGame.outlawsAreHome ?? false;
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
    battingTeam: (event.battingTeam === "opponent" ? "opponent" : "outlaws") as "outlaws" | "opponent",
    result: event.result || "single",
    zone: event.zone || "",
    x: event.x,
    y: event.y,
    eventType: event.eventType || "ball_in_play",
    eventTimestamp: event.timestamp || now,
    description: event.description || `${event.batter} ${event.result}`,
    outsAfter: event.stateAfter?.outs ?? 0,
    outlawsRunsAfter: event.stateAfter?.outlawsRuns ?? game.score?.outlaws ?? 0,
    opponentRunsAfter: event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    basesAfter: event.stateAfter?.bases || { first: null, second: null, third: null },
    createdAt: now,
  }));
  db.playEvents.push(...eventRows);

  await writeDb(db);
  return NextResponse.json({ ok: true, gameId: storedGame.clientGameId, syncedEvents: eventRows.length });
}
