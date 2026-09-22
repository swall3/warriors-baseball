// Pure plan-aggregation math (Decision 2, MVP scope item 3: "see aggregated
// equipment list"). Deliberately dependency-free beyond drills.ts, so tests
// can exercise it without a database or a request session — same reasoning as
// training-store.ts's rollup logic being covered by pure unit tests.
//
// Equipment-quantity policy (documented, not solved): DUGOUT-MASTER-DEEP-DIVE
// section 2 flags that "simultaneously running stations may require summed
// equipment; sequential drills often reuse the same gear" as an open
// question. MVP resolves it the simple way — a practice plan's blocks are
// treated as a coach walking the team through one block at a time (the common
// small-team case), so equipment is a checklist of what's needed at all
// across the plan, annotated with how many blocks/drills call for each item,
// not a simultaneous-station sum. A plan builder that supports parallel
// stations for a big roster is a documented follow-up.
import { getDrill, type Drill } from "./drills.ts";

export type PlanBlockLike = { drillIds: string[]; durationMinutes: number };

export function totalPlanDuration(blocks: PlanBlockLike[]): number {
  return blocks.reduce((sum, b) => sum + Math.max(0, b.durationMinutes || 0), 0);
}

export type EquipmentItem = {
  item: string;
  blockCount: number;
  drillCount: number;
};

export function resolveBlockDrills(block: PlanBlockLike): Drill[] {
  return block.drillIds
    .map((id) => getDrill(id))
    .filter((d): d is Drill => !!d);
}

// Aggregated, de-duplicated equipment checklist across every block in a plan.
// blockCount = how many blocks include at least one drill needing this item
// (useful for "how many stations need cones"); drillCount = total drills
// across the whole plan that call for it.
export function aggregateEquipment(blocks: PlanBlockLike[]): EquipmentItem[] {
  const byItem = new Map<string, EquipmentItem>();
  for (const block of blocks) {
    const drills = resolveBlockDrills(block);
    const itemsInBlock = new Set<string>();
    for (const drill of drills) {
      for (const item of drill.equipment) {
        itemsInBlock.add(item);
        const existing = byItem.get(item);
        if (existing) existing.drillCount += 1;
        else byItem.set(item, { item, blockCount: 0, drillCount: 1 });
      }
    }
    for (const item of itemsInBlock) {
      const existing = byItem.get(item);
      if (existing) existing.blockCount += 1;
    }
  }
  return [...byItem.values()].sort((a, b) => a.item.localeCompare(b.item));
}

// Missing/unresolved drill ids inside a block — used both to warn a coach
// building a plan and to guard the aggregation functions from a plan that
// references a drill id that no longer exists in the code catalog (e.g. an
// old saved plan after a catalog edit).
export function unresolvedDrillIds(blocks: PlanBlockLike[]): string[] {
  const missing: string[] = [];
  for (const block of blocks)
    for (const id of block.drillIds) if (!getDrill(id)) missing.push(id);
  return missing;
}
