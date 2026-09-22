import { test } from "node:test";
import assert from "node:assert/strict";
import { DRILLS, DRILL_CATEGORIES, EQUIPMENT_ITEMS, getDrill } from "../src/lib/practice/drills.ts";
import { PRACTICE_TEMPLATES, getPracticeTemplate, templateDrills } from "../src/lib/practice/templates.ts";
import {
  aggregateEquipment,
  totalPlanDuration,
  unresolvedDrillIds,
} from "../src/lib/practice/aggregate.ts";
import { recommendPractice } from "../src/lib/practice/recommendations.ts";

const VALID_POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const VALID_AGE_BANDS = ["8U", "9U", "10U", "11U", "12U"];

// ── Drill catalog integrity ────────────────────────────────────────────────

test("drill catalog has between 25 and 40 drills", () => {
  assert.ok(DRILLS.length >= 25, `expected at least 25 drills, got ${DRILLS.length}`);
  assert.ok(DRILLS.length <= 40, `expected at most 40 drills, got ${DRILLS.length}`);
});

test("every drill id is unique", () => {
  const ids = new Set();
  for (const d of DRILLS) {
    assert.ok(!ids.has(d.id), `duplicate drill id ${d.id}`);
    ids.add(d.id);
  }
});

test("every drill has a valid category", () => {
  for (const d of DRILLS)
    assert.ok(DRILL_CATEGORIES.includes(d.category), `${d.id} has invalid category ${d.category}`);
});

test("every drill category in DRILL_CATEGORIES is used by at least one drill", () => {
  for (const c of DRILL_CATEGORIES)
    assert.ok(DRILLS.some((d) => d.category === c), `no drill uses category ${c}`);
});

test("every drill position is a real field position", () => {
  for (const d of DRILLS)
    for (const p of d.positions)
      assert.ok(VALID_POSITIONS.includes(p), `${d.id} has invalid position ${p}`);
});

test("every drill age band is valid", () => {
  for (const d of DRILLS) {
    assert.ok(d.ageBands.length > 0, `${d.id} has no age bands`);
    for (const a of d.ageBands)
      assert.ok(VALID_AGE_BANDS.includes(a), `${d.id} has invalid age band ${a}`);
  }
});

test("every drill has a sane duration (1-60 minutes)", () => {
  for (const d of DRILLS) {
    assert.ok(Number.isFinite(d.durationMinutes), `${d.id} duration is not a number`);
    assert.ok(d.durationMinutes >= 1 && d.durationMinutes <= 60, `${d.id} duration out of range: ${d.durationMinutes}`);
  }
});

test("every drill has non-empty name, players, space, setup, equipment, instructions", () => {
  for (const d of DRILLS) {
    assert.ok(d.name.trim().length > 0, `${d.id} missing name`);
    assert.ok(d.players.trim().length > 0, `${d.id} missing players`);
    assert.ok(d.space.trim().length > 0, `${d.id} missing space`);
    assert.ok(d.setup.trim().length > 0, `${d.id} missing setup`);
    assert.ok(Array.isArray(d.equipment) && d.equipment.length > 0, `${d.id} missing equipment`);
    assert.ok(Array.isArray(d.instructions) && d.instructions.length > 0, `${d.id} missing instructions`);
  }
});

test("every drill's equipment items come from the controlled EQUIPMENT_ITEMS vocabulary", () => {
  // This is what makes aggregateEquipment's dedup meaningful — free-text
  // equipment strings ("10 balls" vs "1 ball per pair") would each print as a
  // separate checklist line for a coach even though they mean the same item.
  for (const d of DRILLS)
    for (const item of d.equipment)
      assert.ok(EQUIPMENT_ITEMS.includes(item), `${d.id} has non-canonical equipment item "${item}"`);
});

test("getDrill resolves known ids and rejects unknown ones", () => {
  const first = DRILLS[0];
  assert.equal(getDrill(first.id)?.id, first.id);
  assert.equal(getDrill("not-a-real-drill"), undefined);
});

// ── Template integrity ──────────────────────────────────────────────────────

test("6 to 10 preloaded practice templates", () => {
  assert.ok(PRACTICE_TEMPLATES.length >= 6, `expected at least 6 templates, got ${PRACTICE_TEMPLATES.length}`);
  assert.ok(PRACTICE_TEMPLATES.length <= 10, `expected at most 10 templates, got ${PRACTICE_TEMPLATES.length}`);
});

test("template ids are unique", () => {
  const ids = new Set();
  for (const t of PRACTICE_TEMPLATES) {
    assert.ok(!ids.has(t.id), `duplicate template id ${t.id}`);
    ids.add(t.id);
  }
});

test("every template has at least one block, and block ids are unique within it", () => {
  for (const t of PRACTICE_TEMPLATES) {
    assert.ok(t.blocks.length > 0, `${t.id} has no blocks`);
    const blockIds = new Set();
    for (const b of t.blocks) {
      assert.ok(!blockIds.has(b.id), `${t.id} has duplicate block id ${b.id}`);
      blockIds.add(b.id);
    }
  }
});

test("every template block references only drill ids that exist in the catalog", () => {
  for (const t of PRACTICE_TEMPLATES)
    for (const b of t.blocks)
      for (const id of b.drillIds)
        assert.ok(getDrill(id), `${t.id} block ${b.id} references unknown drill ${id}`);
});

test("every template block has at least one drill and a positive duration", () => {
  for (const t of PRACTICE_TEMPLATES)
    for (const b of t.blocks) {
      assert.ok(b.drillIds.length > 0, `${t.id} block ${b.id} has no drills`);
      assert.ok(b.durationMinutes > 0, `${t.id} block ${b.id} has non-positive duration`);
    }
});

test("getPracticeTemplate resolves known ids and rejects unknown ones", () => {
  const first = PRACTICE_TEMPLATES[0];
  assert.equal(getPracticeTemplate(first.id)?.id, first.id);
  assert.equal(getPracticeTemplate("not-a-real-template"), undefined);
});

test("templateDrills returns the resolved, de-duplicated drill objects for a template", () => {
  const template = PRACTICE_TEMPLATES[0];
  const drills = templateDrills(template);
  const expectedIds = new Set(template.blocks.flatMap((b) => b.drillIds));
  assert.equal(drills.length, expectedIds.size);
  for (const d of drills) assert.ok(expectedIds.has(d.id));
});

// ── Plan aggregation ─────────────────────────────────────────────────────────

test("totalPlanDuration sums block durations", () => {
  const blocks = [
    { drillIds: [], durationMinutes: 10 },
    { drillIds: [], durationMinutes: 15 },
    { drillIds: [], durationMinutes: 20 },
  ];
  assert.equal(totalPlanDuration(blocks), 45);
});

test("totalPlanDuration ignores negative/garbage durations rather than subtracting", () => {
  const blocks = [{ drillIds: [], durationMinutes: -5 }, { drillIds: [], durationMinutes: 10 }];
  assert.equal(totalPlanDuration(blocks), 10);
});

test("aggregateEquipment de-duplicates equipment across drills and blocks", () => {
  const a = DRILLS.find((d) => d.id === "d-infield-forehand-shuffle");
  const b = DRILLS.find((d) => d.id === "d-infield-backhand-drop-step");
  assert.ok(a && b);
  const blocks = [
    { drillIds: [a.id], durationMinutes: 10 },
    { drillIds: [b.id], durationMinutes: 10 },
  ];
  const result = aggregateEquipment(blocks);
  // Both drills use "10-15 balls" and "cones" — should collapse to one entry each,
  // with blockCount 2 (used in both stations).
  const balls = result.find((r) => r.item === "10-15 balls" || r.item === "cones");
  assert.ok(balls, "expected shared equipment items to be aggregated");
  for (const item of result) {
    assert.ok(item.blockCount >= 1 && item.blockCount <= blocks.length);
    assert.ok(item.drillCount >= item.blockCount);
  }
});

test("aggregateEquipment counts an item once per block even if two drills in the same block share it", () => {
  const drillsWithBalls = DRILLS.filter((d) => d.equipment.some((e) => /ball/i.test(e))).slice(0, 2);
  assert.ok(drillsWithBalls.length === 2, "need two drills that both use a ball-containing item for this test");
  const blocks = [{ drillIds: drillsWithBalls.map((d) => d.id), durationMinutes: 20 }];
  const result = aggregateEquipment(blocks);
  for (const item of result) assert.ok(item.blockCount <= 1, "single block cannot contribute more than 1 to blockCount");
});

test("aggregateEquipment on an empty plan returns an empty list", () => {
  assert.deepEqual(aggregateEquipment([]), []);
});

test("unresolvedDrillIds flags ids missing from the catalog and ignores valid ones", () => {
  const valid = DRILLS[0].id;
  const blocks = [{ drillIds: [valid, "ghost-drill"], durationMinutes: 10 }];
  assert.deepEqual(unresolvedDrillIds(blocks), ["ghost-drill"]);
});

test("unresolvedDrillIds on an all-valid plan is empty", () => {
  const blocks = PRACTICE_TEMPLATES[0].blocks;
  assert.deepEqual(unresolvedDrillIds(blocks), []);
});

test("plan aggregation can resolve a team-authored drill", () => {
  const teamDrill = {
    ...DRILLS[0],
    id: "custom-test",
    name: "Our custom rep",
    equipment: ["cones"],
  };
  const resolve = (id) => id === teamDrill.id ? teamDrill : getDrill(id);
  const blocks = [{ drillIds: [teamDrill.id], durationMinutes: 10 }];
  assert.deepEqual(unresolvedDrillIds(blocks, resolve), []);
  assert.deepEqual(aggregateEquipment(blocks, resolve), [
    { item: "cones", blockCount: 1, drillCount: 1 },
  ]);
});

test("postgame recommendation prioritizes a recorded defensive error", () => {
  const result = recommendPractice({
    zones: [["RF", 5], ["SS", 2]],
    contacts: [
      { side: "them", zone: "SS", result: "error" },
      { side: "them", zone: "RF", result: "single" },
    ],
  });
  assert.ok(result);
  assert.equal(result.zone, "SS");
  assert.match(result.reason, /recorded error/i);
  assert.ok(result.drills.length >= 1);
  assert.ok(result.blocks.every((block) => block.drillIds.length > 0));
});

test("postgame recommendation labels opportunity volume without grading the defense", () => {
  const result = recommendPractice({
    zones: [["CF", 4]],
    contacts: [{ side: "them", zone: "CF", result: "single" }],
  });
  assert.ok(result);
  assert.equal(result.zone, "CF");
  assert.match(result.reason, /opportunity volume, not a grade/i);
  assert.ok(
    result.drills.every((drill) =>
      drill.category === "team-defense" || drill.positions.some((position) => ["CF"].includes(position)),
    ),
  );
});
