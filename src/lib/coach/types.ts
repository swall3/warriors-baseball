import type { FieldZone, PlayResult, TeamAtBat } from "@/lib/coach/game-types";
import type { Bases } from "@/lib/coach/game-types";

export type PlayEvent = {
  id: string;
  batter: string;
  battingTeam: TeamAtBat;
  result: PlayResult;
  zone: FieldZone;
  x: number;
  y: number;
  inning: number;
  pitchType?: string;
  description?: string;
  outsAfter?: number;
  stateAfter?: {
    outs: number;
    outlawsRuns: number;
    opponentRuns: number;
    bases: Bases;
  };
};

export type Game = {
  id: string;
  label: string;
  events: PlayEvent[];
};
