// Client-safe position-practice bundles: presentation copy + aggregate counts,
// with NO scenarioId lists (those would let a client recover targetZone, since
// membership == {ballZone, targetZone} and the catalog exposes ballZone). Use
// this in client components. Server code that needs the actual scenarios of a
// bundle uses bundles.ts (server-only, imports the answer pool).
import type { ScenarioCategory, FieldZone } from "../scenarioTypes.ts";
import { BUNDLE_SUMMARIES } from "../scenarioCatalog.ts";
import { POSITION_META, POSITION_ORDER, bundleId } from "./bundleMeta.ts";

export type PositionPracticeBundleSummary = {
  id: string;
  position: FieldZone;
  label: string;
  skillFocus: string;
  scenarioCount: number;
  categoryCounts: Record<ScenarioCategory, number>;
};

export const POSITION_PRACTICE_BUNDLE_SUMMARIES: PositionPracticeBundleSummary[] =
  POSITION_ORDER.flatMap((position) => {
    const summary = BUNDLE_SUMMARIES[position];
    if (!summary || summary.scenarioCount === 0) return [];
    const meta = POSITION_META[position];
    return [
      {
        id: bundleId(position),
        position,
        label: meta.label,
        skillFocus: meta.skillFocus,
        scenarioCount: summary.scenarioCount,
        categoryCounts: summary.categoryCounts,
      },
    ];
  });

export function bundleSummaryForZone(
  zone: string | undefined,
): PositionPracticeBundleSummary | undefined {
  if (!zone) return undefined;
  return POSITION_PRACTICE_BUNDLE_SUMMARIES.find((b) => b.position === zone);
}
