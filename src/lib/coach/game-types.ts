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

export type TeamAtBat = "outlaws" | "opponent";

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
    outlawsRuns: number;
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
  score: { outlaws: number; opponents: number };
  opponentTeamName?: string;
  outlawsAreHome?: boolean;
  schemaVersion?: number;
};
