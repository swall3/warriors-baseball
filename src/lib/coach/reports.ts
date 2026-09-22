import type { LocalDb } from "./local-db";
import type { LiveGame } from "./live/model";
import type { Receipt } from "./live/insights";
import { batter, battingSide } from "./live/model.ts";
import { gameInsights } from "./live/insights.ts";
import { zoneAnchorPct } from "./field-geometry.ts";
import type { PlayEvent } from "./types";

export type ReportGame = {
  id: string;
  source: "historical" | "shared";
  sourceId: string;
  label: string;
  date: string;
  opponentTeamName: string;
  score: { us: number; opponents: number };
  usAreHome: boolean;
  pinCount: number;
  pins: PlayEvent[];
  href: string;
  status?: string;
  missingContext?: number;
};
const zones: Record<string, PlayEvent["zone"]> = {
  P: "pitcher_zone",
  C: "catcher_zone",
  "1B": "first_base",
  "2B": "second_base",
  "3B": "third_base",
  SS: "shortstop",
  LF: "left_field",
  LCF: "left_center",
  CF: "center_field",
  RCF: "right_center",
  RF: "right_field",
};
export function historicalReports(db: LocalDb): ReportGame[] {
  const teams = new Map(db.teams.map((t) => [t.id, t.name]));
  const grouped = new Map<string, PlayEvent[]>();
  for (const e of [...db.playEvents].sort(
    (a, b) => a.eventIndex - b.eventIndex,
  )) {
    if (
      e.eventType !== "ball_in_play" &&
      !["walk", "strikeout"].includes(e.result)
    )
      continue;
    const pins = grouped.get(e.gameId) ?? [];
    pins.push({
      id: e.clientPinId || e.id,
      batter: e.batter,
      battingTeam: e.battingTeam,
      result: e.result as PlayEvent["result"],
      zone: e.zone as PlayEvent["zone"],
      x: e.x,
      y: e.y,
      inning: e.inning,
      description: e.description,
    });
    grouped.set(e.gameId, pins);
  }
  return db.games.map((g) => ({
    id: `historical:${g.clientGameId}`,
    source: "historical",
    sourceId: g.clientGameId,
    label: g.label,
    date: g.playedAt,
    opponentTeamName: teams.get(g.opponentTeamId) ?? "Opponents",
    score: { us: g.usScore, opponents: g.opponentScore },
    usAreHome: g.usAreHome ?? false,
    pins: grouped.get(g.id) ?? [],
    pinCount: grouped.get(g.id)?.length ?? 0,
    href: `/coach/game/${encodeURIComponent(g.clientGameId)}`,
  }));
}
export function sharedReport(game: LiveGame, receipts: Receipt[]): ReportGame {
  const insights = gameInsights(game, receipts);
  const pins: PlayEvent[] = insights.contacts.map((c, i) => {
    const zone = zones[c.zone];
    const [x, y] = zoneAnchorPct(zone);
    return {
      id: `${game.id}:${i}`,
      batter: c.batter,
      battingTeam: c.side,
      result: c.result as PlayEvent["result"],
      zone,
      x,
      y,
      inning: c.inning,
      description: "Recorded field zone; approximate location",
    };
  });
  const undone = new Set(
    receipts
      .filter((r) => r.command.type === "undo")
      .map(
        (r) =>
          (r.command as Extract<Receipt["command"], { type: "undo" }>).targetId,
      ),
  );
  for (const row of receipts) {
    const before = row.before_state,
      c = row.command;
    if (!before || undone.has(row.id)) continue;
    let result: "walk" | "strikeout" | undefined;
    if (c.type === "end_at_bat") result = c.outcome;
    if (c.type === "pitch" && before.config.format === "kid_pitch") {
      if (c.outcome === "ball" && before.balls === 3) result = "walk";
      if (
        ["called_strike", "swinging_strike"].includes(c.outcome) &&
        before.strikes === 2
      )
        result = "strikeout";
    }
    if (result)
      pins.push({
        id: row.id,
        batter: batter(before).name,
        battingTeam: battingSide(before),
        result,
        zone: "catcher_zone",
        x: 50,
        y: 95,
        inning: before.inning,
        description: "At-bat outcome; no batted-ball location",
      });
  }
  return {
    id: `shared:${game.id}`,
    source: "shared",
    sourceId: game.id,
    label: `${game.config.teamName} vs ${game.config.opponent}`,
    date: game.config.date,
    opponentTeamName: game.config.opponent,
    score: { us: game.score.us, opponents: game.score.them },
    usAreHome: game.config.usAreHome,
    pins,
    pinCount: pins.length,
    href: `/coach/live/${encodeURIComponent(game.id)}/insights`,
    status: game.status,
    missingContext: insights.missingContext,
  };
}
// Synced server history supersedes the matching device copy. Shared IDs are
// namespaced so an unrelated historical ID never hides a live game.
export function mergeReportGames<
  T extends { id: string; sourceId?: string; source?: string },
>(local: T[], server: T[]): T[] {
  const historicalIds = new Set(
    server.filter((g) => g.source !== "shared").map((g) => g.sourceId ?? g.id),
  );
  return [...server, ...local.filter((g) => !historicalIds.has(g.id))];
}
