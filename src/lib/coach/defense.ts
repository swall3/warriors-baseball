// Defense-position data shared by the coach dashboard (rotation groups) and
// the live-scoring page (position picker). These two screens use related but
// differently-shaped data — see the merge report for why they were kept
// separate rather than forced into one shape.

// ---- Dashboard rotation groups (flat spot codes + A1/A2/B1/B2/C1/C2 groups) ----

export type DefenseGroupName = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type DefenseAssignments = Record<string, string>;
export type DefenseGroups = Record<DefenseGroupName, DefenseAssignments>;

// Flat list of defensive spot codes used for the rotation-group grid on the
// dashboard (src/app/coach/dashboard/page.tsx).
export const DEFENSE_SPOTS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "LCF", "RCF", "RF", "BENCH"] as const;

export const DEFENSE_GROUP_NAMES: DefenseGroupName[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

// ---- Live-scoring position picker ({code,label} objects, format-dependent) ----

export type DefenseSpot = { code: string; label: string };

export const DEFENSE_SPOTS_COACH_PITCH: DefenseSpot[] = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "LCF", label: "Left Center" },
  { code: "RCF", label: "Right Center" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];

export const DEFENSE_SPOTS_KID_PITCH: DefenseSpot[] = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "CF", label: "Center Field" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];

export const ALL_DEFENSE_SPOTS: DefenseSpot[] = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "LCF", label: "Left Center" },
  { code: "CF", label: "Center Field" },
  { code: "RCF", label: "Right Center" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];
