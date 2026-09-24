// Client-safe scenario types and constants. Importable from anywhere
// (client or server). Contains NO answer data — the BACKUP_SCENARIOS pool
// with question/targetZone/explanation lives server-only in gameData.ts.

export type ScenarioCategory = 'cover' | 'backup' | 'relay' | 'miss_recovery';

export const SCENARIO_CATEGORIES: ScenarioCategory[] = [
  'cover',
  'backup',
  'relay',
  'miss_recovery',
];

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  cover: 'Who covers',
  backup: 'Who backs up',
  relay: 'Who to throw to',
  miss_recovery: 'When we miss',
};

export type FieldZone =
  | 'LF'
  | 'CF'
  | 'RF'
  | 'P'
  | '1B'
  | '2B'
  | 'SS'
  | '3B'
  | 'C';

// The client-safe projection of a scenario: everything EXCEPT the answer
// (question, targetZone, explanation). Clients render pickers and labels from
// this; answers are delivered per active/assigned scenario by server APIs.
export type ScenarioCatalogEntry = {
  id: string;
  label: string;
  category: ScenarioCategory;
  runners: { first: boolean; second: boolean; third: boolean };
  ballZone: FieldZone;
  ballReachesTarget?: boolean;
};
