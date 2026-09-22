import { DRILLS, type Drill } from "./drills.ts";
import type { FieldPosition } from "./bundles.ts";
import type { PracticeBlock } from "./templates.ts";

const ZONE_POSITIONS: Record<string, FieldPosition[]> = {
  P: ["P"],
  C: ["C"],
  "1B": ["1B"],
  "2B": ["2B", "SS"],
  "3B": ["3B", "SS"],
  SS: ["SS", "2B"],
  LF: ["LF", "CF"],
  LCF: ["LF", "CF"],
  CF: ["CF"],
  RCF: ["RF", "CF"],
  RF: ["RF", "CF"],
  pitcher_zone: ["P"],
  catcher_zone: ["C"],
  first_base: ["1B"],
  second_base: ["2B", "SS"],
  third_base: ["3B", "SS"],
  shortstop: ["SS", "2B"],
  left_field: ["LF", "CF"],
  left_center: ["LF", "CF"],
  center_field: ["CF"],
  right_center: ["RF", "CF"],
  right_field: ["RF", "CF"],
};

export type PracticeRecommendation = {
  zone: string;
  positions: FieldPosition[];
  reason: string;
  evidenceLabel: string;
  drills: Drill[];
  blocks: PracticeBlock[];
};

export function recommendPractice(input: {
  zones: [string, number][];
  contacts: { side: "us" | "them"; zone: string; result: string }[];
}): PracticeRecommendation | null {
  const opponent = input.contacts.filter((contact) => contact.side === "them");
  const errors = new Map<string, number>();
  for (const contact of opponent)
    if (contact.result === "error") errors.set(contact.zone, (errors.get(contact.zone) ?? 0) + 1);
  const errorFocus = [...errors.entries()].sort((a, b) => b[1] - a[1])[0];
  const opportunityFocus = input.zones[0];
  const focus = errorFocus ?? opportunityFocus;
  if (!focus) return null;
  const [zone, count] = focus;
  const positions = ZONE_POSITIONS[zone] ?? [];
  if (!positions.length) return null;
  const positional = DRILLS.filter((drill) => drill.positions.some((position) => positions.includes(position)));
  const recovery = DRILLS.filter((drill) =>
    (drill.positions.some((position) => positions.includes(position)) || drill.category === "team-defense") &&
    (errorFocus
      ? drill.scenarioCategory === "miss-recovery"
      : ["backup", "relay", "cover"].includes(drill.scenarioCategory ?? "")),
  );
  const warmup = DRILLS.find((drill) => drill.id === "d-throwing-arm-care-warmup");
  const chosen = [...positional.slice(0, 2), ...recovery]
    .filter((drill, index, list) => list.findIndex((item) => item.id === drill.id) === index)
    .slice(0, 3);
  if (!chosen.length) return null;
  const focusLabel = zone.replaceAll("_", " ").toUpperCase();
  return {
    zone,
    positions,
    reason: errorFocus
      ? `${count} recorded error${count === 1 ? "" : "s"} in the ${focusLabel} area make recovery and communication the clearest next focus.`
      : `${count} recorded ball${count === 1 ? "" : "s"} reached the ${focusLabel} area. That is opportunity volume, not a grade, so use coach observation to confirm the focus.`,
    evidenceLabel: errorFocus ? "RECORDED ERROR PATTERN" : "MOST DEFENSIVE OPPORTUNITIES",
    drills: chosen,
    blocks: [
      ...(warmup ? [{ id: "recommended-warmup", label: "Arm care warmup", durationMinutes: 10, drillIds: [warmup.id] }] : []),
      { id: "recommended-focus", label: `${positions.join(" / ")} focus reps`, durationMinutes: 25, drillIds: chosen.slice(0, 2).map((drill) => drill.id) },
      ...(chosen[2] ? [{ id: "recommended-team", label: "Team defense finish", durationMinutes: 15, drillIds: [chosen[2].id] }] : []),
    ],
  };
}
