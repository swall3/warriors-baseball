// Position practice bundles (Decision 1, docs/PRACTICE-ASSIGNMENT-AND-DRILLS.md).
//
// A "position practice" is the coach-facing assignable unit: an ordered set of
// BACKUP_SCENARIOS ids for one field position, optionally with a skill-focus
// label. Coaches assign the bundle once; the player works the scenarios in
// order; each scenario's answer/result path is unchanged underneath.
//
// Grouping rule (deliberately explicit, original content): a scenario belongs
// to a position's bundle if that position either FIELDS the play (ballZone)
// or is the correct backup/relay/coverage answer (targetZone). That matches
// how a coach thinks about "second base defense" — both "the ball comes to
// you" reps and "you have to cover/back up" reps belong to the same drill
// set. Scenario order is stable (catalog order in gameData.ts).
//
// Decision 3 update: the catalog now carries a `category` (cover / backup /
// relay / miss_recovery), so every position bundle automatically picks up all
// four skills for that position — no new grouping rule needed, because a
// cover scenario for 2B still has 2B as its ballZone or targetZone. What IS
// new is `categoryCounts`, so coaches can see the mix, and the fact that the
// session layer (practice/sessions.ts) interleaves by category so a single
// sitting mixes skills instead of being twelve straight backup questions.
//
// `scenarioIds` deliberately stays in catalog order. `training_assignments`
// rows written by assignBundle() carry a `bundle_position` alongside their
// `scenario_id`, and coach-facing progress reads back in that order — so the
// stored order is data, not presentation. Mixing happens at the session
// layer, where nothing is persisted.
import {
  BACKUP_SCENARIOS,
  SCENARIO_CATEGORIES,
  type BackupScenario,
  type ScenarioCategory,
} from "../gameData.ts";

export type FieldPosition = BackupScenario["ballZone"];

export type PositionPracticeBundle = {
  id: string;
  position: FieldPosition;
  label: string;
  skillFocus: string;
  scenarioIds: string[];
  /** How many scenarios of each skill this bundle contains. */
  categoryCounts: Record<ScenarioCategory, number>;
};

const POSITION_META: Record<
  FieldPosition,
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

const POSITION_ORDER: FieldPosition[] = [
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

function scenarioIdsForPosition(position: FieldPosition): string[] {
  const ids = new Set<string>();
  for (const scenario of BACKUP_SCENARIOS)
    if (scenario.ballZone === position || scenario.targetZone === position)
      ids.add(scenario.id);
  // Preserve catalog order rather than Set insertion order.
  return BACKUP_SCENARIOS.filter((s) => ids.has(s.id)).map((s) => s.id);
}

function emptyCategoryCounts(): Record<ScenarioCategory, number> {
  return Object.fromEntries(SCENARIO_CATEGORIES.map((c) => [c, 0])) as Record<
    ScenarioCategory,
    number
  >;
}

function categoryCountsFor(scenarioIds: string[]): Record<ScenarioCategory, number> {
  const counts = emptyCategoryCounts();
  const wanted = new Set(scenarioIds);
  for (const s of BACKUP_SCENARIOS) if (wanted.has(s.id)) counts[s.category] += 1;
  return counts;
}

export const POSITION_PRACTICE_BUNDLES: PositionPracticeBundle[] =
  POSITION_ORDER.map((position) => {
    const meta = POSITION_META[position];
    const scenarioIds = scenarioIdsForPosition(position);
    return {
      id: `pos-${position.toLowerCase()}`,
      position,
      label: meta.label,
      skillFocus: meta.skillFocus,
      scenarioIds,
      categoryCounts: categoryCountsFor(scenarioIds),
    };
  }).filter((b) => b.scenarioIds.length > 0);

/** The scenarios of one bundle, in catalog order. */
export function bundleScenarios(bundle: PositionPracticeBundle): BackupScenario[] {
  const wanted = new Set(bundle.scenarioIds);
  return BACKUP_SCENARIOS.filter((s) => wanted.has(s.id));
}

export function getPositionPracticeBundle(
  id: string,
): PositionPracticeBundle | undefined {
  return POSITION_PRACTICE_BUNDLES.find((b) => b.id === id);
}

// Best bundle to recommend for a given field-position zone (e.g. an insights
// "most plays at this zone" callout). Falls back to undefined if the zone
// isn't a recognized position.
export function bundleForZone(
  zone: string | undefined,
): PositionPracticeBundle | undefined {
  if (!zone) return undefined;
  return POSITION_PRACTICE_BUNDLES.find((b) => b.position === zone);
}
