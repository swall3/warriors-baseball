import { validatePitchRules, type PitchRules } from "./pitch-rules.ts";
/** Shared, server-validated game commands. No I/O and no client authority. */
export type Side = "us" | "them";
export type Lane = "coach" | "pitch" | "play" | "all" | "display";
export type Pitch =
  "ball" | "called_strike" | "swinging_strike" | "foul" | "in_play";
export type Result =
  | "single"
  | "double"
  | "triple"
  | "home_run"
  | "out"
  | "error"
  | "fielders_choice";
export type Position =
  "P" | "C" | "1B" | "2B" | "3B" | "SS" | "LF" | "CF" | "RF" | "LCF" | "RCF";
export type Player = { id: string; name: string };
export type Config = {
  teamId: string;
  teamName: string;
  opponent: string;
  date: string;
  usAreHome: boolean;
  format: "kid_pitch" | "coach_pitch";
  innings: number;
  roster: Player[];
  order: string[];
  opponentOrder: Player[];
  positions: Partial<Record<Position, string>>;
  crewMode: "combined" | "split";
  pitchRules?: PitchRules;
};
export type Runner = { id: string; name: string };
export type Move = { id: string; to: "out" | "1" | "2" | "3" | "home" };
export type Command =
  | { type: "configure"; config: Config }
  | { type: "start" }
  | { type: "pitch"; outcome: Pitch }
  | { type: "end_at_bat"; outcome: "walk" | "strikeout" }
  | {
      type: "result";
      pitchId: string;
      result: Result;
      zone: Position;
      moves: Move[];
      countRunsOnThirdOut: boolean;
    }
  | { type: "runners"; moves: Move[]; countRunsOnThirdOut: boolean }
  | { type: "pitcher"; side: Side; pitcher: Player }
  | { type: "defense"; positions: Config["positions"]; when: "now" | "next" }
  | { type: "advance" }
  | { type: "finish" }
  | { type: "undo"; targetId: string }
  | {
      type: "correct";
      reason: string;
      balls: number;
      strikes: number;
      outs: number;
      score: Record<Side, number>;
      bases: Record<"1" | "2" | "3", string | null>;
      pitchCounts: Record<string, number>;
    };
export type Snapshot = {
  config: Config;
  status: "ready" | "live" | "final";
  inning: number;
  half: "top" | "bottom";
  outs: number;
  balls: number;
  strikes: number;
  score: Record<Side, number>;
  battingIndex: Record<Side, number>;
  bases: Record<"1" | "2" | "3", Runner | null>;
  pitchers: Record<Side, Player>;
  pitchCounts: Record<string, number>;
  pending: { id: string; batter: Runner; pitcher: Player } | null;
  nextPositions: Config["positions"] | null;
  lastCorrection?: { reason: string; at: string };
};
export type LiveGame = Snapshot & {
  id: string;
  revision: number;
  updatedAt: string;
  undo: { id: string; before: Snapshot; label: string } | null;
};
export class GameRuleError extends Error {}
function requireRule(ok: unknown, message: string): asserts ok {
  if (!ok) throw new GameRuleError(message);
}
export const fieldPositions = (format: Config["format"]): Position[] =>
  format === "coach_pitch"
    ? ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF"]
    : ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const text = (x: unknown, max = 120): x is string =>
  typeof x === "string" && x.trim().length > 0 && x.length <= max;
function validatePlayers(players: Player[]) {
  requireRule(
    Array.isArray(players) && players.length > 0 && players.length <= 30,
    "Choose 1–30 players.",
  );
  requireRule(
    players.every((p) => p && text(p.id) && text(p.name)),
    "Player names and IDs are required.",
  );
  requireRule(
    new Set(players.map((p) => p.id)).size === players.length,
    "A player may appear only once.",
  );
}
export function validateDefense(
  positions: Config["positions"],
  config: Config,
  complete = false,
) {
  requireRule(
    positions && typeof positions === "object" && !Array.isArray(positions),
    "Choose defensive positions.",
  );
  const slots = fieldPositions(config.format);
  const entries = Object.entries(positions);
  requireRule(
    entries.every(
      ([slot, id]) =>
        slots.includes(slot as Position) &&
        config.roster.some((p) => p.id === id),
    ),
    "Position or player is not in this lineup.",
  );
  requireRule(
    new Set(entries.map(([, id]) => id)).size === entries.length,
    "Each player can hold one position.",
  );
  if (complete)
    requireRule(
      slots.every((slot) => positions[slot]),
      `Fill all ${slots.length} defensive positions before starting.`,
    );
}
export function validateConfig(c: Config) {
  requireRule(
    c && text(c.teamId) && text(c.teamName) && text(c.opponent),
    "Choose a team and opponent.",
  );
  requireRule(
    text(c.date) &&
      /^\d{4}-\d{2}-\d{2}$/.test(c.date) &&
      !Number.isNaN(Date.parse(c.date)),
    "Choose the game date.",
  );
  requireRule(
    typeof c.usAreHome === "boolean" &&
      ["kid_pitch", "coach_pitch"].includes(c.format),
    "Choose home/away and field format.",
  );
  requireRule(
    Number.isInteger(c.innings) && c.innings >= 1 && c.innings <= 20,
    "Choose 1–20 innings.",
  );
  requireRule(
    ["combined", "split"].includes(c.crewMode),
    "Choose the recording crew.",
  );
  if (c.pitchRules) {
    try {
      validatePitchRules(c.pitchRules);
    } catch (e) {
      throw new GameRuleError((e as Error).message);
    }
  }
  validatePlayers(c.roster);
  validatePlayers(c.opponentOrder);
  requireRule(
    Array.isArray(c.order) &&
      c.order.length > 0 &&
      c.order.length <= c.roster.length,
    "Choose a batting order.",
  );
  requireRule(
    new Set(c.order).size === c.order.length &&
      c.order.every((id) => c.roster.some((p) => p.id === id)),
    "Batting order contains duplicate or unknown players.",
  );
  validateDefense(c.positions, c);
}
export function battingSide(s: Snapshot): Side {
  return (s.half === "bottom") === s.config.usAreHome ? "us" : "them";
}
export function batter(s: Snapshot): Runner {
  const side = battingSide(s);
  const order =
    side === "us"
      ? s.config.order.map((id) => s.config.roster.find((p) => p.id === id)!)
      : s.config.opponentOrder;
  return order[s.battingIndex[side] % order.length];
}
export function pitchingSide(s: Snapshot): Side {
  return battingSide(s) === "us" ? "them" : "us";
}
export function pitchKey(side: Side, id: string) {
  return `${side}:${id}`;
}
export function makeGame(id: string, config: Config, now: string): LiveGame {
  validateConfig(config);
  const own =
    config.roster.find((p) => p.id === config.positions.P) ?? config.roster[0];
  return {
    id,
    revision: 0,
    updatedAt: now,
    undo: null,
    config: structuredClone(config),
    status: "ready",
    inning: 1,
    half: "top",
    outs: 0,
    balls: 0,
    strikes: 0,
    score: { us: 0, them: 0 },
    battingIndex: { us: 0, them: 0 },
    bases: { "1": null, "2": null, "3": null },
    pitchers: {
      us:
        config.format === "coach_pitch" ? { id: "coach", name: "Coach" } : own,
      them: { id: "opponent-pitcher", name: "Opposing pitcher" },
    },
    pitchCounts: {},
    pending: null,
    nextPositions: null,
  };
}
export function mayCommand(lane: Lane, command: Command) {
  if (lane === "coach") return true;
  if (lane === "pitch")
    return command.type === "pitch" || command.type === "end_at_bat";
  if (lane === "play")
    return command.type === "result" || command.type === "runners";
  if (lane === "all")
    return ["pitch", "end_at_bat", "result", "runners"].includes(command.type);
  return false;
}
function snapshot(g: LiveGame): Snapshot {
  const { id, revision, updatedAt, undo, ...s } = g;
  void id;
  void revision;
  void updatedAt;
  void undo;
  return structuredClone(s);
}
function nextBatter(s: Snapshot) {
  s.battingIndex[battingSide(s)]++;
  s.balls = 0;
  s.strikes = 0;
  s.pending = null;
}
function nextHalf(s: Snapshot) {
  if (s.half === "top") s.half = "bottom";
  else {
    s.half = "top";
    s.inning++;
  }
  s.outs = 0;
  s.balls = 0;
  s.strikes = 0;
  s.bases = { "1": null, "2": null, "3": null };
  s.pending = null;
  if (pitchingSide(s) === "us" && s.nextPositions) {
    s.config.positions = s.nextPositions;
    s.nextPositions = null;
    if (s.config.format === "kid_pitch")
      s.pitchers.us = s.config.roster.find(
        (p) => p.id === s.config.positions.P,
      )!;
  }
}
function forceWalk(s: Snapshot, b: Runner) {
  if (s.bases["1"]) {
    if (s.bases["2"]) {
      if (s.bases["3"]) s.score[battingSide(s)]++;
      s.bases["3"] = s.bases["2"];
    }
    s.bases["2"] = s.bases["1"];
  }
  s.bases["1"] = b;
}
function moveRunners(
  s: Snapshot,
  runners: Runner[],
  moves: Move[],
  countRuns: boolean,
) {
  requireRule(
    Array.isArray(moves) && moves.length === runners.length,
    "Choose a destination for every runner.",
  );
  requireRule(
    new Set(moves.map((m) => m.id)).size === moves.length &&
      moves.every((m) => runners.some((r) => r.id === m.id)),
    "Each runner needs exactly one destination.",
  );
  requireRule(
    moves.every((m) => ["out", "1", "2", "3", "home"].includes(m.to)),
    "Invalid runner destination.",
  );
  const occupied = moves
    .filter((m) => ["1", "2", "3"].includes(m.to))
    .map((m) => m.to);
  requireRule(
    new Set(occupied).size === occupied.length,
    "Two runners cannot occupy the same base.",
  );
  const newOuts = moves.filter((m) => m.to === "out").length;
  requireRule(
    s.outs + newOuts <= 3,
    "Record only outs that occurred before the inning ended.",
  );
  requireRule(
    typeof countRuns === "boolean",
    "Confirm whether runs count on the third out.",
  );
  s.bases = { "1": null, "2": null, "3": null };
  for (const move of moves)
    if (move.to !== "out" && move.to !== "home")
      s.bases[move.to] = runners.find((r) => r.id === move.id)!;
  if (s.outs + newOuts < 3 || countRuns)
    s.score[battingSide(s)] += moves.filter((m) => m.to === "home").length;
  s.outs += newOuts;
}
export function applyCommand(
  game: LiveGame,
  command: Command,
  commandId: string,
  lane: Lane,
  now: string,
): LiveGame {
  requireRule(
    command && typeof command.type === "string",
    "A game command is required.",
  );
  requireRule(
    mayCommand(lane, command),
    "This recording role cannot perform that action.",
  );
  requireRule(
    game.status !== "final" || command.type === "undo",
    "The game is final. Undo finalization before editing.",
  );
  const before = snapshot(game);
  let s = structuredClone(before);
  if (command.type === "undo") {
    requireRule(
      game.undo && game.undo.id === command.targetId,
      "Only the latest action can be undone. Refresh the game.",
    );
    return {
      ...game,
      ...structuredClone(game.undo.before),
      revision: game.revision + 1,
      updatedAt: now,
      undo: null,
    };
  }
  if (command.type === "configure") {
    requireRule(
      s.status === "ready",
      "Lineup setup is locked after the first pitch. Use substitutions.",
    );
    validateConfig(command.config);
    requireRule(
      command.config.teamId === s.config.teamId,
      "A game's team cannot change.",
    );
    s = snapshot(makeGame(game.id, command.config, now));
  } else if (command.type === "start") {
    requireRule(s.status === "ready", "This game has already started.");
    validateDefense(s.config.positions, s.config, true);
    s.status = "live";
  } else {
    requireRule(s.status === "live", "Start the game first.");
    switch (command.type) {
      case "correct": {
        requireRule(
          !s.pending,
          "Finish or undo the pending ball in play before correcting the game.",
        );
        requireRule(
          text(command.reason, 240),
          "Explain the correction for the recording crew.",
        );
        const integer = (v: unknown, max: number) =>
          Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
        requireRule(
          integer(command.balls, s.config.format === "kid_pitch" ? 3 : 99) &&
            integer(
              command.strikes,
              s.config.format === "kid_pitch" ? 2 : 99,
            ) &&
            integer(command.outs, 2),
          "Enter a valid count and 0–2 outs.",
        );
        requireRule(
          command.score &&
            integer(command.score.us, 999) &&
            integer(command.score.them, 999),
          "Enter valid scores.",
        );
        const players =
          battingSide(s) === "us" ? s.config.roster : s.config.opponentOrder;
        requireRule(
          command.bases &&
            Object.keys(command.bases).length === 3 &&
            ["1", "2", "3"].every((k) => k in command.bases),
          "Confirm all three bases.",
        );
        const ids = Object.values(command.bases).filter(
          (id): id is string => id !== null,
        );
        requireRule(
          new Set(ids).size === ids.length &&
            ids.every((id) => players.some((p) => p.id === id)),
          "Runners must be distinct players from the batting team.",
        );
        const keys = new Set([
          ...Object.keys(s.pitchCounts),
          ...Object.entries(s.pitchers).map(([side, p]) =>
            pitchKey(side as Side, p.id),
          ),
        ]);
        requireRule(
          command.pitchCounts &&
            Object.keys(s.pitchCounts).every((k) => k in command.pitchCounts) &&
            Object.entries(command.pitchCounts).every(
              ([k, v]) => keys.has(k) && integer(v, 999),
            ),
          "Correct only recorded or current pitchers; keep every existing total.",
        );
        s.lastCorrection = { reason: command.reason.trim(), at: now };
        s.balls = command.balls;
        s.strikes = command.strikes;
        s.outs = command.outs;
        s.score = { ...command.score };
        s.pitchCounts = { ...command.pitchCounts };
        for (const key of ["1", "2", "3"] as const)
          s.bases[key] =
            players.find((p) => p.id === command.bases[key]) ?? null;
        break;
      }
      case "pitch": {
        requireRule(
          !s.pending,
          "Finish the current play before recording another pitch.",
        );
        requireRule(
          [
            "ball",
            "called_strike",
            "swinging_strike",
            "foul",
            "in_play",
          ].includes(command.outcome),
          "Unknown pitch outcome.",
        );
        const b = batter(s);
        const side = pitchingSide(s);
        const p = s.pitchers[side];
        const key = pitchKey(side, p.id);
        s.pitchCounts[key] = (s.pitchCounts[key] ?? 0) + 1;
        if (command.outcome === "in_play")
          s.pending = { id: commandId, batter: b, pitcher: p };
        else if (command.outcome === "ball") {
          s.balls++;
          if (s.config.format === "kid_pitch" && s.balls === 4) {
            forceWalk(s, b);
            nextBatter(s);
          }
        } else if (command.outcome === "foul") {
          if (s.strikes < 2) s.strikes++;
        } else {
          s.strikes++;
          if (s.config.format === "kid_pitch" && s.strikes === 3) {
            s.outs++;
            nextBatter(s);
          }
        }
        if (s.outs === 3) nextHalf(s);
        break;
      }
      case "end_at_bat": {
        requireRule(
          s.config.format === "coach_pitch",
          "Kid-pitch walks and strikeouts follow the recorded count.",
        );
        requireRule(!s.pending, "Finish the pending play first.");
        requireRule(
          ["walk", "strikeout"].includes(command.outcome),
          "Choose the at-bat outcome.",
        );
        if (command.outcome === "walk") forceWalk(s, batter(s));
        else s.outs++;
        nextBatter(s);
        if (s.outs === 3) nextHalf(s);
        break;
      }
      case "result": {
        requireRule(
          s.pending && s.pending.id === command.pitchId,
          "This play must match the pending pitch. Refresh before recording it.",
        );
        requireRule(
          [
            "single",
            "double",
            "triple",
            "home_run",
            "out",
            "error",
            "fielders_choice",
          ].includes(command.result),
          "Unknown play result.",
        );
        requireRule(
          [
            "P",
            "C",
            "1B",
            "2B",
            "3B",
            "SS",
            "LF",
            "CF",
            "RF",
            "LCF",
            "RCF",
          ].includes(command.zone),
          "Choose where the ball went.",
        );
        const runners = [
          ...Object.values(s.bases).filter((r): r is Runner => !!r),
          s.pending.batter,
        ];
        moveRunners(s, runners, command.moves, command.countRunsOnThirdOut);
        nextBatter(s);
        if (s.outs === 3) nextHalf(s);
        break;
      }
      case "runners": {
        requireRule(!s.pending, "Resolve the ball in play first.");
        const runners = Object.values(s.bases).filter((r): r is Runner => !!r);
        requireRule(runners.length > 0, "There are no runners to move.");
        moveRunners(s, runners, command.moves, command.countRunsOnThirdOut);
        if (s.outs === 3) nextHalf(s);
        break;
      }
      case "pitcher": {
        requireRule(!s.pending, "Finish the play before changing pitchers.");
        requireRule(
          ["us", "them"].includes(command.side),
          "Choose the pitching team.",
        );
        requireRule(
          command.pitcher &&
            text(command.pitcher.id) &&
            text(command.pitcher.name),
          "Choose a pitcher.",
        );
        if (command.side === "us" && s.config.format === "kid_pitch") {
          const p = s.config.roster.find((p) => p.id === command.pitcher.id);
          requireRule(p, "Pitcher must be on the roster.");
          const old = s.config.positions.P;
          const position = Object.entries(s.config.positions).find(
            ([, id]) => id === p.id,
          )?.[0] as Position | undefined;
          if (position) {
            if (old) s.config.positions[position] = old;
            else delete s.config.positions[position];
          }
          s.config.positions.P = p.id;
          s.pitchers.us = p;
        } else s.pitchers[command.side] = command.pitcher;
        break;
      }
      case "defense":
        requireRule(!s.pending, "Finish the play before changing defense.");
        requireRule(
          ["now", "next"].includes(command.when),
          "Choose when to publish positions.",
        );
        validateDefense(command.positions, s.config, true);
        if (command.when === "next")
          s.nextPositions = structuredClone(command.positions);
        else {
          s.config.positions = structuredClone(command.positions);
          if (s.config.format === "kid_pitch")
            s.pitchers.us = s.config.roster.find(
              (p) => p.id === s.config.positions.P,
            )!;
        }
        break;
      case "advance":
        requireRule(!s.pending, "Finish the pending play first.");
        nextHalf(s);
        break;
      case "finish":
        requireRule(!s.pending, "Finish the pending play first.");
        s.status = "final";
        break;
      default:
        throw new GameRuleError("Unknown game command.");
    }
  }
  return {
    ...game,
    ...s,
    revision: game.revision + 1,
    updatedAt: now,
    undo: { id: commandId, before, label: command.type },
  };
}
