import type { PersistedGamePayload } from "./game-types";
import { readScoreUs } from "./game-types";
import { LiveError } from "./live/store";
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
const number = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
export function validateHistoricalGame(game: PersistedGamePayload) {
  const bad = () => {
    throw new LiveError("Invalid game data. Check the import and retry.", 400);
  };
  if (
    !text(game.id, 150) ||
    !game.id ||
    !Array.isArray(game.pins) ||
    game.pins.length > 10000 ||
    !text(game.label ?? "", 200) ||
    !text(game.opponentTeamName ?? "", 120) ||
    !text(game.date, 40) ||
    Number.isNaN(Date.parse(game.date))
  )
    bad();
  if (
    !number(readScoreUs(game.score) ?? 0, 1000) ||
    !number(game.score?.opponents ?? 0, 1000) ||
    !Number.isInteger(readScoreUs(game.score) ?? 0) ||
    !Number.isInteger(game.score?.opponents ?? 0)
  )
    bad();
  if (
    game.eventsV2 !== undefined &&
    (!Array.isArray(game.eventsV2) || game.eventsV2.length > 10000)
  )
    bad();
  for (const e of [...game.pins, ...(game.eventsV2 ?? [])]) {
    if (
      !e ||
      !text(e.batter ?? "", 120) ||
      !text(e.zone ?? "", 60) ||
      ![
        "single",
        "double",
        "triple",
        "home_run",
        "out",
        "error",
        "fielders_choice",
        "walk",
        "strikeout",
        "foul",
      ].includes(e.result) ||
      !number(e.x, 100) ||
      !number(e.y, 100) ||
      !Number.isInteger(e.inning ?? 1) ||
      (e.inning ?? 1) < 1 ||
      (e.inning ?? 1) > 30
    )
      bad();
    if (
      e.battingTeam !== undefined &&
      !["us", "them", "outlaws", "opponent", "wahoos"].includes(e.battingTeam)
    )
      bad();
  }
  for (const e of game.eventsV2 ?? []) {
    if (
      !text(e.id, 150) ||
      !e.id ||
      !["pitch", "ball_in_play"].includes(e.eventType) ||
      !text(e.timestamp, 40) ||
      Number.isNaN(Date.parse(e.timestamp)) ||
      !text(e.description ?? "", 2000)
    )
      bad();
  }
}
