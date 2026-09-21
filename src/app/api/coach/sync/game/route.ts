import { NextResponse } from "next/server";
import type { GameEventV2, PersistedGamePayload } from "@/lib/coach/game-types";
import { readScoreUs, readStateUsRuns, readUsAreHome, toTeamAtBat } from "@/lib/coach/game-types";
import { makeId, normalizeTeamName, readDb, writeDb } from "@/lib/coach/local-db";
import { isSupabaseEnabled, sbDelete, sbInsert, sbSelectAll, sbUpsert, type OrgScope } from "@/lib/supabase";
import { requireCoach } from "@/lib/coach/auth";
import { getOrgScope } from "@/lib/tenant/context";

function toV2Events(game: PersistedGamePayload): GameEventV2[] {
  if (Array.isArray(game.eventsV2) && game.eventsV2.length > 0) return game.eventsV2;
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
      return await syncToSupabase(game, await getOrgScope());
    }
    return await syncToLocalFile(game, await getOrgScope());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Cross-device path: targeted upserts. NEVER rewrite the whole DB — that would
// let two phones syncing different games clobber each other.
async function syncToSupabase(game: PersistedGamePayload, scope: OrgScope) {
  const now = new Date().toISOString();
  const opponentTeamName = normalizeTeamName(game.opponentTeamName);
  const normalizedName = opponentTeamName.toLowerCase();

  // 1) Resolve/create the opponent team by its normalized name.
  //
  // This lookup is defect T1's crime scene. `normalized_name` used to be a
  // GLOBAL unique, so this select would find ANOTHER org's "NYO Bucks" row and
  // silently attach this org's game to it — merging two tenants' scouting data
  // for that opponent. Migration 011 rebuilt the unique as
  // (org_id, normalized_name) and the scope below narrows the select, so two
  // orgs that both play the Bucks now get two rows, which is the correct
  // outcome (§2.3): a spray chart of the Bucks' hitters is private scouting
  // data that each org paid for with its own game-day attention.
  const existingTeams = await sbSelectAll<{ id: string }>(
    scope,
    "teams",
    `normalized_name=eq.${encodeURIComponent(normalizedName)}&select=id`,
  );
  let teamId = existingTeams[0]?.id;
  if (!teamId) {
    teamId = makeId("team");
    await sbInsert(scope, "teams", [
      {
        id: teamId,
        name: opponentTeamName,
        normalized_name: normalizedName,
        // Explicit rather than left to 008's column default: this row is an
        // opponent scouting record, and `kind` is what distinguishes it from
        // the org's own team (§2.3). The default happens to agree; relying on
        // that would make the distinction invisible at the only site that
        // creates these rows.
        kind: "opponent",
        created_at: now,
      },
    ]);
  } else {
    // Keep the display name fresh without touching the id.
    await sbUpsert(scope, "teams", [{ id: teamId, name: opponentTeamName, normalized_name: normalizedName }], "id");
  }

  // 2) Resolve/create the game by its client id; preserve the existing row id.
  const existingGames = await sbSelectAll<{ id: string }>(
    scope,
    "games",
    `client_game_id=eq.${encodeURIComponent(game.id)}&select=id`,
  );
  const gameId = existingGames[0]?.id ?? makeId("game");
  await sbUpsert(
    scope,
    "games",
    [
      {
        id: gameId,
        client_game_id: game.id,
        label: game.label || `${opponentTeamName} game`,
        played_at: game.date || now,
        opponent_team_id: teamId,
        us_score: readScoreUs(game.score) ?? 0,
        opponent_score: game.score?.opponents ?? 0,
        source: "local_storage",
        schema_version: game.schemaVersion ?? 2,
        us_home: readUsAreHome(game) ?? false,
        updated_at: now,
      },
    ],
    // ⚠️ "org_id,client_game_id", not "client_game_id". Migration 011 replaced
    // the global unique on client_game_id with an org-scoped one, and PostgREST
    // resolves an onConflict list against a real unique index — the old value
    // would now fail with "no unique or exclusion constraint matching the ON
    // CONFLICT specification" and break game sync outright. The scoped target
    // is also the point: client_game_id is `game-${Date.now()}`, and with a
    // global conflict target another org's colliding sync would UPDATE this
    // org's game row. ON CONFLICT resolution happens in Postgres, so no
    // application-layer filter can prevent that — only the scoped unique can
    // (011 section 3).
    "org_id,client_game_id",
  );

  // 3) Replace this game's events only (scoped delete + insert).
  const eventsV2 = toV2Events(game);
  await sbDelete(scope, "play_events", `game_id=eq.${encodeURIComponent(gameId)}`);
  const eventRows = eventsV2.map((event, index) => ({
    id: makeId("evt"),
    game_id: gameId,
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
    us_runs_after: readStateUsRuns(event.stateAfter) ?? readScoreUs(game.score) ?? 0,
    opponent_runs_after: event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    bases_after: event.stateAfter?.bases || { first: null, second: null, third: null },
    created_at: now,
  }));
  await sbInsert(scope, "play_events", eventRows);

  return NextResponse.json({ ok: true, gameId: game.id, syncedEvents: eventRows.length });
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
    storedGame.opponentScore = game.score?.opponents ?? storedGame.opponentScore;
    storedGame.schemaVersion = game.schemaVersion ?? storedGame.schemaVersion ?? 2;
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
    usRunsAfter: readStateUsRuns(event.stateAfter) ?? readScoreUs(game.score) ?? 0,
    opponentRunsAfter: event.stateAfter?.opponentRuns ?? game.score?.opponents ?? 0,
    basesAfter: event.stateAfter?.bases || { first: null, second: null, third: null },
    createdAt: now,
  }));
  db.playEvents.push(...eventRows);

  await writeDb(db);
  return NextResponse.json({ ok: true, gameId: storedGame.clientGameId, syncedEvents: eventRows.length });
}
