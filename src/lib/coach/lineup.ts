// Lineup-plan model + pure planning logic for /coach/lineup (Phase 3).
//
// Everything here is side-effect free and framework-free so it can be reasoned
// about (and run under plain node) without a browser or a database. The React
// page owns all I/O; this file owns all rules.
//
// Storage model note — read this before changing anything:
//
// The live-scoring page stores defense as SIX GROUPS keyed by position code
// (`defenseGroups: {A1: {SS: "Jack", "1B": "Linc", …}, …}`) plus a mapping from
// inning to group (`inningDefenseGroup: {1:"A1", 2:"A2", …}`). The grid on
// /coach/lineup is players × innings, which is a *view* over that model, not a
// replacement for it. Writes go back through the group the inning points at, so
// the live-scoring screen and the dashboard keep working unchanged.
//
// The consequence, which the UI surfaces rather than hides: if two innings map
// to the same group, editing either one changes both. The default mapping is
// 1:1 across 6 innings and 6 groups, so that only happens if a coach points two
// innings at one group deliberately.

import {
  ALL_DEFENSE_SPOTS,
  DEFENSE_GROUP_NAMES,
  DEFENSE_SPOTS_COACH_PITCH,
  DEFENSE_SPOTS_KID_PITCH,
  type DefenseAssignments,
  type DefenseGroupName,
  type DefenseGroups,
  type DefenseSpot,
} from "@/lib/coach/defense";
import { canonicalPlayerName } from "@/lib/coach/player-name";

export type GameFormat = "coach_pitch" | "kid_pitch";

export type LineupPlan = {
  id: string;
  gameId: string | null; // client game id ("game-2026-05-24-bucks"), not the DB row id
  teamId: string;
  label: string;
  format: GameFormat;
  battingOrder: string[];
  groups: DefenseGroups;
  inningMap: Record<number, DefenseGroupName>;
  updatedAt: string;
};

// 6 innings, 6 rotation groups — matches PLANNED_INNINGS in the dashboard and
// DEFAULT_INNING_DEFENSE_GROUP on the live-scoring page.
export const PLANNED_INNINGS = 6;

// Fairness thresholds. The total limit is the one the dashboard already applies
// (`bench > 1 ? 'text-amber-300' : …` at dashboard/page.tsx, in the Bench
// Fairness panel) — a kid sitting 2+ innings of 6 gets flagged. The consecutive
// limit is the additional live constraint Phase 4 calls for: never sit twice
// in a row.
export const BENCH_TOTAL_LIMIT = 1;
export const BENCH_CONSECUTIVE_LIMIT = 1;

export const BENCH_CODE = "BENCH";

// A `teams.id` row value, not a label — deliberately untouched by migration
// 006, which renamed only the perspective vocabulary. Changing it means an
// UPDATE across every FK that references it.
//
// ⚠️ T6 IS FIXED, AND THIS CONSTANT SURVIVED IT. The earlier note here
// predicted the constant would "go away"; that turned out to be half right, so
// here is what actually happened (MULTI-TENANT-PLAN §0.3 T6):
//
//   * The two SERVER fallbacks are gone. api/coach/lineup/route.ts used to
//     read `searchParams.get("teamId") || DEFAULT_TEAM_ID` and write
//     `plan.teamId || DEFAULT_TEAM_ID` — a request that named no team read and
//     WROTE tenant #1's data. Both are now 400s. That was the defect.
//
//   * The three CLIENT uses below (makeBlankPlan, normalizePlan) stay. They
//     are not a tenant fallback: they seed a brand-new local plan in the
//     browser, offline, before anything is sent anywhere, on a device that
//     belongs to exactly one org. Turning them into throws would break offline
//     plan creation — the feature lineup-sync.ts's whole "localStorage is the
//     write-ahead buffer" contract exists to protect — and would fix nothing,
//     because the server no longer accepts an unnamed team regardless of what
//     the client seeded.
//
// It becomes per-org config in MT-4, alongside branding, when `teams` rows are
// resolved from the org rather than named by a constant.
export const DEFAULT_TEAM_ID = "team-outlaws";

// localStorage keys. The first is the live-scoring blob — shared, and merged
// into rather than overwritten (see readPlanFromStorage/writePlanToStorage in
// the page). The second holds plan metadata that has no home in that blob.
//
// Also deliberately untouched by 006: this string is the address of Stuart's
// only copy of in-progress game state, and renaming it orphans that blob
// silently. T7 owns the rename and ships an old-key -> new-key migration with
// it (MULTI-TENANT-PLAN §0.3 T7, §6.4).
export const COACH_STORAGE_KEY = "outlaws-field-app:v1";
export const LINEUP_PLAN_KEY = "warriors-coach:lineup-plan:v1";

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export function makeBlankDefense(): DefenseAssignments {
  const next: DefenseAssignments = {};
  for (const spot of ALL_DEFENSE_SPOTS) next[spot.code] = "";
  return next;
}

export function makeBlankGroups(): DefenseGroups {
  return {
    A1: makeBlankDefense(),
    A2: makeBlankDefense(),
    B1: makeBlankDefense(),
    B2: makeBlankDefense(),
    C1: makeBlankDefense(),
    C2: makeBlankDefense(),
  };
}

// 1:1 inning→group. Keeping this the default is what makes per-inning editing
// safe — see the storage-model note at the top of the file.
export function defaultInningMap(): Record<number, DefenseGroupName> {
  const map: Record<number, DefenseGroupName> = {};
  for (let i = 1; i <= PLANNED_INNINGS; i++) {
    map[i] = DEFENSE_GROUP_NAMES[(i - 1) % DEFENSE_GROUP_NAMES.length];
  }
  return map;
}

// The plan id MUST be derivable from (teamId, gameId) rather than random.
//
// It is the only key the client has to address its row: /api/coach/lineup is
// queried by id, and the id itself lives in localStorage. A random id would be
// device-local, which defeats the entire point of Phase 3 — a phone lost after
// the game takes the only handle to the saved plan with it, and the dashboard
// laptop mints a fresh id, misses, and writes a duplicate row instead of
// loading the plan. Deterministic means every device addresses the same row.
export function planIdFor(teamId: string, gameId: string | null): string {
  return `lp-${teamId}-${gameId ?? "current"}`;
}

export function makeEmptyPlan(overrides: Partial<LineupPlan> = {}): LineupPlan {
  const teamId = overrides.teamId || DEFAULT_TEAM_ID;
  const gameId = overrides.gameId ?? null;
  return {
    id: planIdFor(teamId, gameId),
    gameId: null,
    teamId: DEFAULT_TEAM_ID,
    label: "Game plan",
    format: "coach_pitch",
    battingOrder: [],
    groups: makeBlankGroups(),
    inningMap: defaultInningMap(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Same fallback the dashboard uses: an unmapped inning cycles through the
// groups rather than erroring.
export function groupForInning(
  inningMap: Record<number, DefenseGroupName> | null | undefined,
  inning: number,
): DefenseGroupName {
  const mapped = inningMap?.[inning];
  if (mapped && DEFENSE_GROUP_NAMES.includes(mapped)) return mapped;
  return DEFENSE_GROUP_NAMES[(Math.max(inning, 1) - 1) % DEFENSE_GROUP_NAMES.length];
}

// Field positions only — BENCH is derived from absence, never picked. See
// benchInningsFor() below for why.
export function fieldSpotsForFormat(format: GameFormat): DefenseSpot[] {
  const spots = format === "kid_pitch" ? DEFENSE_SPOTS_KID_PITCH : DEFENSE_SPOTS_COACH_PITCH;
  return spots.filter((spot) => spot.code !== BENCH_CODE);
}

// ---------------------------------------------------------------------------
// Roster derivation
// ---------------------------------------------------------------------------

// Grid rows. The batting order comes first and in order (that's the sheet a
// coach reads top-to-bottom), then anyone who appears in a defense group but
// isn't in the batting order, alphabetically.
//
// ⚠️ This union is B5 made visible: DEFAULT_US_LINEUP is jersey numbers
// ("#00", "#3", …) while DEFAULT_DEFENSE_GROUPS holds names ("Jack", "Linc").
// Until the jersey↔name mapping is resolved (MERGE-PLAN.md §9 item 4) an
// untouched install shows both sets as separate rows. That is the honest
// rendering of the underlying data, not a bug in this function.
export function rosterFromPlan(plan: LineupPlan): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const raw of plan.battingOrder) {
    const name = canonicalPlayerName(raw);
    if (!name || name === "Unknown" || seen.has(name)) continue;
    seen.add(name);
    ordered.push(name);
  }

  const extras = new Set<string>();
  for (const group of DEFENSE_GROUP_NAMES) {
    const assignments = plan.groups?.[group];
    if (!assignments) continue;
    for (const code of Object.keys(assignments)) {
      const raw = (assignments[code] || "").trim();
      if (!raw) continue;
      const name = canonicalPlayerName(raw);
      if (!name || name === "Unknown" || seen.has(name)) continue;
      extras.add(name);
    }
  }

  return [...ordered, ...[...extras].sort((a, b) => a.localeCompare(b))];
}

// ---------------------------------------------------------------------------
// Grid reads
// ---------------------------------------------------------------------------

// The position a player holds in a given inning, or null when they're not on
// the field. An explicit BENCH assignment reads as null — benched is benched.
export function assignmentFor(plan: LineupPlan, player: string, inning: number): string | null {
  const assignments = plan.groups?.[groupForInning(plan.inningMap, inning)];
  if (!assignments) return null;
  for (const code of Object.keys(assignments)) {
    if (code === BENCH_CODE) continue;
    const raw = (assignments[code] || "").trim();
    if (raw && canonicalPlayerName(raw) === player) return code;
  }
  return null;
}

export type PlacedAssignment = { inning: number; spot: string; player: string };

// Flattens the group model into (inning, spot, player) triples — the shape both
// conflict checks operate on.
export function placementsFor(plan: LineupPlan, innings = PLANNED_INNINGS): PlacedAssignment[] {
  const out: PlacedAssignment[] = [];
  for (let inning = 1; inning <= innings; inning++) {
    const assignments = plan.groups?.[groupForInning(plan.inningMap, inning)];
    if (!assignments) continue;
    for (const code of Object.keys(assignments)) {
      if (code === BENCH_CODE) continue;
      const raw = (assignments[code] || "").trim();
      if (!raw) continue;
      out.push({ inning, spot: code, player: canonicalPlayerName(raw) });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export type LineupConflict = {
  kind: "duplicate_position" | "duplicate_player";
  inning: number;
  spot?: string;
  player?: string;
  detail: string;
};

// Both checks the task calls for.
//
// ⚠️ `duplicate_position` is currently unreachable by construction: a group is
// `Record<spotCode, playerName>`, so one inning physically cannot hold two
// players at SS — the second write overwrites the first. It is implemented
// anyway because it is the check a coach expects to exist, it costs nothing,
// and it becomes live the moment assignments are re-keyed by player_id
// (MERGE-PLAN.md §2.5). Do not delete it as dead code.
export function detectConflicts(plan: LineupPlan, innings = PLANNED_INNINGS): LineupConflict[] {
  const conflicts: LineupConflict[] = [];
  const placements = placementsFor(plan, innings);

  for (let inning = 1; inning <= innings; inning++) {
    const thisInning = placements.filter((p) => p.inning === inning);

    const bySpot = new Map<string, string[]>();
    const byPlayer = new Map<string, string[]>();
    for (const { spot, player } of thisInning) {
      bySpot.set(spot, [...(bySpot.get(spot) || []), player]);
      byPlayer.set(player, [...(byPlayer.get(player) || []), spot]);
    }

    for (const [spot, players] of bySpot) {
      if (players.length < 2) continue;
      conflicts.push({
        kind: "duplicate_position",
        inning,
        spot,
        detail: `Inning ${inning}: ${players.join(" and ")} are both at ${spot}`,
      });
    }

    for (const [player, spots] of byPlayer) {
      if (spots.length < 2) continue;
      conflicts.push({
        kind: "duplicate_player",
        inning,
        player,
        detail: `Inning ${inning}: ${player} is at ${spots.join(" and ")}`,
      });
    }
  }

  return conflicts;
}

// Innings whose group is shared with another inning. Editing one of these cells
// silently changes the other inning too, so the grid says so out loud.
export function sharedGroupInnings(
  plan: LineupPlan,
  innings = PLANNED_INNINGS,
): Array<{ group: DefenseGroupName; innings: number[] }> {
  const byGroup = new Map<DefenseGroupName, number[]>();
  for (let inning = 1; inning <= innings; inning++) {
    const group = groupForInning(plan.inningMap, inning);
    byGroup.set(group, [...(byGroup.get(group) || []), inning]);
  }
  return [...byGroup.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([group, list]) => ({ group, innings: list }));
}

// ---------------------------------------------------------------------------
// Bench fairness
// ---------------------------------------------------------------------------

export type FairnessRow = {
  player: string;
  byInning: Array<string | null>; // index 0 === inning 1
  fieldInnings: number;
  benchInnings: number;
  longestBenchStreak: number;
  overBenchTotal: boolean;
  overBenchStreak: boolean;
};

// Bench is derived from ABSENCE, not from the BENCH key.
//
// The group model has exactly one BENCH slot, so it can only ever name one
// benched kid per inning — useless for an 11+ player roster where 2-3 sit every
// inning. A player is benched in inning i if they hold no field position in
// inning i, which is also what makes the grid's empty cells a fairness report
// for free.
//
// This means these counts can exceed the dashboard's Bench Fairness panel,
// which reads `counts.BENCH` only. That's a deliberate correction, not drift.
export function buildFairness(plan: LineupPlan, innings = PLANNED_INNINGS): FairnessRow[] {
  return rosterFromPlan(plan).map((player) => {
    const byInning: Array<string | null> = [];
    for (let inning = 1; inning <= innings; inning++) {
      byInning.push(assignmentFor(plan, player, inning));
    }

    let benchInnings = 0;
    let longestBenchStreak = 0;
    let streak = 0;
    for (const spot of byInning) {
      if (spot) {
        streak = 0;
        continue;
      }
      benchInnings += 1;
      streak += 1;
      if (streak > longestBenchStreak) longestBenchStreak = streak;
    }

    return {
      player,
      byInning,
      fieldInnings: innings - benchInnings,
      benchInnings,
      longestBenchStreak,
      overBenchTotal: benchInnings > BENCH_TOTAL_LIMIT,
      overBenchStreak: longestBenchStreak > BENCH_CONSECUTIVE_LIMIT,
    };
  });
}

// ---------------------------------------------------------------------------
// Grid writes
// ---------------------------------------------------------------------------

// Assign `player` to `spot` in `inning`, or bench them when spot is null.
//
// Always clears the player out of every other spot in the same group first —
// otherwise tapping a new position would leave them standing at the old one as
// well, which is exactly the duplicate_player conflict above.
export function assignPlayer(
  plan: LineupPlan,
  player: string,
  inning: number,
  spot: string | null,
): LineupPlan {
  const group = groupForInning(plan.inningMap, inning);
  const current = plan.groups?.[group] || makeBlankDefense();
  const next: DefenseAssignments = { ...current };

  for (const code of Object.keys(next)) {
    const raw = (next[code] || "").trim();
    if (raw && canonicalPlayerName(raw) === player) next[code] = "";
  }

  if (spot && spot !== BENCH_CODE) {
    next[spot] = player;
  }

  return {
    ...plan,
    groups: { ...plan.groups, [group]: next },
    updatedAt: new Date().toISOString(),
  };
}

export function setInningGroup(
  plan: LineupPlan,
  inning: number,
  group: DefenseGroupName,
): LineupPlan {
  return {
    ...plan,
    inningMap: { ...plan.inningMap, [inning]: group },
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Normalization (used on both the API and localStorage read paths — anything
// coming from outside this module is untrusted shape)
// ---------------------------------------------------------------------------

export function normalizeGroups(raw: unknown): DefenseGroups {
  const groups = makeBlankGroups();
  if (!raw || typeof raw !== "object") return groups;
  const source = raw as Record<string, unknown>;
  for (const name of DEFENSE_GROUP_NAMES) {
    const entry = source[name];
    if (!entry || typeof entry !== "object") continue;
    const assignments = makeBlankDefense();
    for (const [code, value] of Object.entries(entry as Record<string, unknown>)) {
      assignments[code] = typeof value === "string" ? value : "";
    }
    groups[name] = assignments;
  }
  return groups;
}

export function normalizeInningMap(raw: unknown): Record<number, DefenseGroupName> {
  const map = defaultInningMap();
  if (!raw || typeof raw !== "object") return map;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const inning = Number(key);
    if (!Number.isInteger(inning) || inning < 1 || inning > PLANNED_INNINGS) continue;
    if (typeof value === "string" && DEFENSE_GROUP_NAMES.includes(value as DefenseGroupName)) {
      map[inning] = value as DefenseGroupName;
    }
  }
  return map;
}

export function normalizeFormat(raw: unknown): GameFormat {
  return raw === "kid_pitch" ? "kid_pitch" : "coach_pitch";
}

export function normalizePlan(raw: unknown): LineupPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id) return null;
  return {
    id: source.id,
    gameId: typeof source.gameId === "string" && source.gameId ? source.gameId : null,
    teamId: typeof source.teamId === "string" && source.teamId ? source.teamId : DEFAULT_TEAM_ID,
    label: typeof source.label === "string" && source.label ? source.label : "Game plan",
    format: normalizeFormat(source.format),
    battingOrder: Array.isArray(source.battingOrder)
      ? source.battingOrder.filter((v): v is string => typeof v === "string")
      : [],
    groups: normalizeGroups(source.groups),
    inningMap: normalizeInningMap(source.inningMap),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : new Date().toISOString(),
  };
}
