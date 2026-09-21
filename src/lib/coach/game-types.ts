export type PlayResult =
  | "single"
  | "double"
  | "triple"
  | "home_run"
  | "out"
  | "error"
  | "fielders_choice"
  | "walk"
  | "strikeout"
  | "foul";

// A PERSPECTIVE flag — "the team keeping score" vs "the other guys" — not a
// tenant key and not a team id. See MULTI-TENANT-PLAN §0.2: conflating this
// with tenancy leads to putting an org_id here, which breaks every aggregation
// in analytics.ts. Was `"outlaws" | "opponent"` until migration 006.
export type TeamAtBat = "us" | "them";

// Legacy vocabulary decoder for anything that crossed a persistence boundary
// before 006: localStorage blobs on Stuart's phone, exported game JSON, and
// rows written by a client that hasn't picked up the new bundle yet.
//
// Three generations of the same field are in circulation:
//   "outlaws" / "opponent"   — the original Outlaws app and the pre-006 DB
//   "wahoos"                 — an even older opponent spelling that dashboard
//                              has been special-casing inline since the port
//   "us" / "them"            — current
//
// Anything unrecognised (including undefined) reads as "us", which preserves
// the pre-existing `pin.battingTeam || 'outlaws'` behaviour exactly: the
// earliest pins predate the field entirely and were all our at-bats.
export function toTeamAtBat(value: unknown): TeamAtBat {
  return value === "them" || value === "opponent" || value === "wahoos" ? "them" : "us";
}

export type FieldZone =
  | "left_field"
  | "left_center"
  | "center_field"
  | "right_center"
  | "right_field"
  | "third_base"
  | "shortstop"
  | "second_base"
  | "first_base"
  | "pitcher_zone"
  | "catcher_zone";

export type EventPin = {
  id: number;
  batter: string;
  result: PlayResult;
  zone: FieldZone;
  x: number;
  y: number;
  inning: number;
  battingTeam: TeamAtBat;
};

export type Bases = { first: string | null; second: string | null; third: string | null };

export type GameEventV2 = {
  id: string;
  eventType: "pitch" | "ball_in_play";
  timestamp: string;
  inning: number;
  batter: string;
  battingTeam: TeamAtBat;
  result: PlayResult;
  zone: FieldZone;
  x: number;
  y: number;
  description: string;
  pitchOutcome?: "ball" | "called_strike" | "swinging_strike" | "foul" | "in_play";
  countAfter?: { balls: number; strikes: number };
  stateAfter: {
    outs: number;
    usRuns: number;
    opponentRuns: number;
    bases: Bases;
  };
};

export type PersistedGamePayload = {
  id: string;
  label: string;
  date: string;
  pins: EventPin[];
  eventsV2?: GameEventV2[];
  // `us` was `outlaws` before 006. `opponents` is deliberately NOT renamed to
  // `them` — the plan's §2.6 leaves the opponent-side DB columns
  // (`opponent_score`, `opponent_runs_after`) alone too, and this object mirrors
  // them. Only the `outlaws` half was ever a branding leak.
  score: { us: number; opponents: number };
  opponentTeamName?: string;
  usAreHome?: boolean;
  schemaVersion?: number;
};

// The pre-006 shape of the two persisted payloads, as they still exist in
// localStorage and in any game JSON exported from /coach/import before this
// change. Read sites accept both via `readScoreUs()` / `readUsLineup()` below.
export type LegacyPersistedGamePayload = {
  score?: { outlaws?: number; us?: number; opponents?: number };
  outlawsAreHome?: boolean;
  usAreHome?: boolean;
  outlawsLineup?: string[];
  usLineup?: string[];
};

// Our runs out of a persisted payload, old shape or new.
//
// Returns undefined rather than 0 when the field is absent in both shapes, so
// call sites keep the `?? fallback` semantics they had before 006. Collapsing
// absent to 0 here would make a legitimate 0-0 score indistinguishable from a
// missing one, and the sync route uses exactly that distinction to decide
// whether to overwrite a stored score.
export function readScoreUs(
  score: { us?: number; outlaws?: number } | undefined | null,
): number | undefined {
  if (!score) return undefined;
  if (typeof score.us === "number") return score.us;
  if (typeof score.outlaws === "number") return score.outlaws;
  return undefined;
}

// Our batting order out of a persisted snapshot, old shape or new.
export function readUsLineup(blob: LegacyPersistedGamePayload | null | undefined): string[] | undefined {
  const raw = blob?.usLineup ?? blob?.outlawsLineup;
  if (!Array.isArray(raw)) return undefined;
  return raw.filter((v): v is string => typeof v === "string");
}

// Our running score out of a V2 event's stateAfter, old shape or new.
// `usRuns` was `outlawsRuns` before 006.
export function readStateUsRuns(
  stateAfter: { usRuns?: number; outlawsRuns?: number } | undefined | null,
): number | undefined {
  if (!stateAfter) return undefined;
  if (typeof stateAfter.usRuns === "number") return stateAfter.usRuns;
  if (typeof stateAfter.outlawsRuns === "number") return stateAfter.outlawsRuns;
  return undefined;
}

// Home/away out of a persisted snapshot, old shape or new. Undefined when
// absent in both shapes — same reasoning as readScoreUs: an explicit `false`
// must stay distinguishable from "not recorded".
export function readUsAreHome(
  blob: LegacyPersistedGamePayload | null | undefined,
): boolean | undefined {
  return blob?.usAreHome ?? blob?.outlawsAreHome;
}
