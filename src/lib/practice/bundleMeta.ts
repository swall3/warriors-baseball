// Client-safe bundle presentation copy: per-position label + skill focus, and
// display order. No scenario data or answers — safe to import from anywhere.
import type { FieldZone } from "../scenarioTypes.ts";

export const POSITION_META: Record<
  FieldZone,
  { label: string; skillFocus: string }
> = {
  P: {
    label: "Pitcher coverage & fielding",
    skillFocus:
      "Comebackers, bunt coverage, backing up throws home, and covering first on a ball hit to the right side.",
  },
  C: {
    label: "Catcher game management",
    skillFocus:
      "Pop-ups near the plate, steal reads, wild-pitch recovery, and bases-loaded force plays at home.",
  },
  "1B": {
    label: "First base defense",
    skillFocus:
      "Holding runners, charging bunts, receiving throws across the infield, and cutting off relays.",
  },
  "2B": {
    label: "Second base defense",
    skillFocus:
      "Double-play pivots, covering the bag on steals, and ranging into the outfield gap.",
  },
  "3B": {
    label: "Third base defense",
    skillFocus:
      "Charging bunts and slow rollers, covering the bag on a steal, and cutting off throws from left field.",
  },
  SS: {
    label: "Shortstop defense",
    skillFocus:
      "Double-play feeds, covering second on steals, cutting off relays, and ranging up the middle.",
  },
  LF: {
    label: "Left field defense",
    skillFocus:
      "Backing up third and center, cutting off gap hits, and hitting the right relay target.",
  },
  CF: {
    label: "Center field defense",
    skillFocus:
      "Backing up both corners, calling off teammates, and hitting the cutoff on a runner tagging up.",
  },
  RF: {
    label: "Right field defense",
    skillFocus:
      "Backing up first and center, cutting off gap hits, and hitting the right relay target.",
  },
};

export const POSITION_ORDER: FieldZone[] = [
  "P",
  "C",
  "1B",
  "2B",
  "3B",
  "SS",
  "LF",
  "CF",
  "RF",
];

/** The bundle id used for a given field position. */
export function bundleId(position: FieldZone): string {
  return `pos-${position.toLowerCase()}`;
}
