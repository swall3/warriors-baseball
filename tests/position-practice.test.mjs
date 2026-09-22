import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_SCENARIOS, SCENARIO_CATEGORIES } from "../src/lib/gameData.ts";
import {
  POSITION_PRACTICE_BUNDLES,
  getPositionPracticeBundle,
  bundleForZone,
  bundleScenarios,
} from "../src/lib/practice/bundles.ts";
import {
  QUIZ_SESSION_SIZE,
  chunkIntoSessions,
  interleaveByGroup,
  planSession,
} from "../src/lib/practice/sessions.ts";

test("every bundle references only scenario ids that exist in BACKUP_SCENARIOS", () => {
  const known = new Set(BACKUP_SCENARIOS.map((s) => s.id));
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    assert.ok(bundle.scenarioIds.length > 0, `${bundle.id} has scenarios`);
    for (const id of bundle.scenarioIds)
      assert.ok(known.has(id), `${bundle.id} references unknown scenario ${id}`);
  }
});

test("bundle scenario order matches BACKUP_SCENARIOS catalog order (stable, ordered set)", () => {
  const catalogIndex = new Map(BACKUP_SCENARIOS.map((s, i) => [s.id, i]));
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const indexes = bundle.scenarioIds.map((id) => catalogIndex.get(id));
    const sorted = [...indexes].sort((a, b) => a - b);
    assert.deepEqual(indexes, sorted, `${bundle.id} scenarios are not in catalog order`);
  }
});

test("no duplicate scenario ids within a bundle, and bundle ids are unique", () => {
  const bundleIds = new Set();
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    assert.ok(!bundleIds.has(bundle.id), `duplicate bundle id ${bundle.id}`);
    bundleIds.add(bundle.id);
    assert.equal(
      new Set(bundle.scenarioIds).size,
      bundle.scenarioIds.length,
      `${bundle.id} has duplicate scenarios`,
    );
  }
});

test("every position on the nine-position field has a bundle", () => {
  const positions = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
  for (const position of positions) {
    const bundle = POSITION_PRACTICE_BUNDLES.find((b) => b.position === position);
    assert.ok(bundle, `no bundle for ${position}`);
  }
});

test("a scenario belongs to a position's bundle iff it fields the play or is the correct backup answer", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    for (const id of bundle.scenarioIds) {
      const scenario = BACKUP_SCENARIOS.find((s) => s.id === id);
      assert.ok(
        scenario.ballZone === bundle.position ||
          scenario.targetZone === bundle.position,
        `${id} does not involve ${bundle.position}`,
      );
    }
    // Every scenario that does involve this position should be included.
    for (const scenario of BACKUP_SCENARIOS) {
      if (scenario.ballZone === bundle.position || scenario.targetZone === bundle.position)
        assert.ok(
          bundle.scenarioIds.includes(scenario.id),
          `${bundle.id} is missing ${scenario.id}`,
        );
    }
  }
});

test("getPositionPracticeBundle resolves known ids and rejects unknown ones", () => {
  const first = POSITION_PRACTICE_BUNDLES[0];
  assert.equal(getPositionPracticeBundle(first.id)?.id, first.id);
  assert.equal(getPositionPracticeBundle("not-a-real-bundle"), undefined);
});

test("bundleForZone maps a field-position zone to its bundle, and rejects unknown zones", () => {
  const b = bundleForZone("2B");
  assert.equal(b?.position, "2B");
  assert.equal(bundleForZone("not-a-position"), undefined);
  assert.equal(bundleForZone(undefined), undefined);
});

// ── Coach-view rollup math (mirrors the training_bundle_progress SQL view) ──
function rollup(bundle, assignmentRows) {
  const members = assignmentRows.filter((a) => a.bundle_assignment_id === bundle.assignmentId);
  return {
    scenario_count: members.length,
    scenarios_completed: members.filter((a) => a.correct > 0).length,
    total_attempts: members.reduce((sum, a) => sum + a.attempts, 0),
    total_correct: members.reduce((sum, a) => sum + a.correct, 0),
  };
}

test("bundle progress rolls up per-scenario attempts/correct without mutating them", () => {
  const bundle = { id: "pos-2b", assignmentId: "assign-1" };
  const rows = [
    { bundle_assignment_id: "assign-1", bundle_position: 0, attempts: 2, correct: 1 },
    { bundle_assignment_id: "assign-1", bundle_position: 1, attempts: 0, correct: 0 },
    { bundle_assignment_id: "assign-1", bundle_position: 2, attempts: 3, correct: 1 },
    { bundle_assignment_id: "assign-other", bundle_position: 0, attempts: 5, correct: 5 },
  ];
  const progress = rollup(bundle, rows);
  assert.deepEqual(progress, {
    scenario_count: 3,
    scenarios_completed: 2,
    total_attempts: 5,
    total_correct: 2,
  });
});

test("a bundle with zero completed scenarios reports completed count 0, not undefined", () => {
  const bundle = { id: "pos-p", assignmentId: "assign-2" };
  const rows = [
    { bundle_assignment_id: "assign-2", bundle_position: 0, attempts: 0, correct: 0 },
  ];
  assert.equal(rollup(bundle, rows).scenarios_completed, 0);
});

// ── Decision 3/4: bundles pick up the new categories and chunk into sessions ──

test("categoryCounts sums to the bundle size and covers all four skills", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const total = SCENARIO_CATEGORIES.reduce(
      (sum, c) => sum + bundle.categoryCounts[c],
      0,
    );
    assert.equal(
      total,
      bundle.scenarioIds.length,
      `${bundle.id} categoryCounts do not sum to its scenario count`,
    );
    for (const category of SCENARIO_CATEGORIES)
      assert.ok(
        bundle.categoryCounts[category] > 0,
        `${bundle.id} has no ${category} scenarios`,
      );
  }
});

test("categoryCounts match the actual scenarios in the bundle", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const actual = {};
    for (const s of bundleScenarios(bundle))
      actual[s.category] = (actual[s.category] ?? 0) + 1;
    for (const category of SCENARIO_CATEGORIES)
      assert.equal(
        bundle.categoryCounts[category],
        actual[category] ?? 0,
        `${bundle.id} ${category} count is wrong`,
      );
  }
});

test("bundleScenarios returns the bundle's scenarios in catalog order", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const scenarios = bundleScenarios(bundle);
    assert.deepEqual(
      scenarios.map((s) => s.id),
      bundle.scenarioIds,
      `${bundle.id} scenario order drifted`,
    );
  }
});

test("every bundle is larger than one session, so session chunking matters", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const plan = planSession(bundle.scenarioIds.length, 0);
    assert.ok(
      plan.count > 1,
      `${bundle.id} fits in one session (${bundle.scenarioIds.length} reps)`,
    );
    assert.ok(plan.length <= QUIZ_SESSION_SIZE, `${bundle.id} session too long`);
  }
});

test("interleaved bundle sessions mix skills instead of blocking one", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const ordered = interleaveByGroup(bundleScenarios(bundle), (s) => s.category);
    for (const [i, session] of chunkIntoSessions(ordered).entries()) {
      assert.ok(
        new Set(session.map((s) => s.category)).size >= 3,
        `${bundle.id} session ${i + 1} is not a skill mix`,
      );
    }
  }
});

test("chunking a bundle preserves every scenario exactly once", () => {
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const ordered = interleaveByGroup(bundleScenarios(bundle), (s) => s.category);
    const flat = chunkIntoSessions(ordered).flat().map((s) => s.id);
    assert.deepEqual(
      [...flat].sort(),
      [...bundle.scenarioIds].sort(),
      `${bundle.id} lost or duplicated scenarios when chunked`,
    );
  }
});

test("bundles.ts stores scenarioIds in catalog order, not session order", () => {
  // training_assignments rows carry bundle_position alongside scenario_id, so
  // the stored order is data. Session-layer mixing must not leak back here.
  const catalogIndex = new Map(BACKUP_SCENARIOS.map((s, i) => [s.id, i]));
  for (const bundle of POSITION_PRACTICE_BUNDLES) {
    const indexes = bundle.scenarioIds.map((id) => catalogIndex.get(id));
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), bundle.id);
  }
});
