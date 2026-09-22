// Content-integrity tests for the scenario catalog (Decision 3).
//
// These exist so the catalog can keep growing without anyone having to
// eyeball 128 objects: they assert structure, uniqueness, and — crucially —
// per-position and per-category coverage minimums, so an expansion that
// accidentally stuffs 40 new relay scenarios into the shortstop's bundle and
// leaves center field with two fails here rather than in a kid's session.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BACKUP_SCENARIOS,
  SCENARIO_CATEGORIES,
  CATEGORY_LABELS,
} from "../src/lib/gameData.ts";

const POSITIONS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

test("catalog is in the target size band (Decision 3: roughly 100-160)", () => {
  assert.ok(
    BACKUP_SCENARIOS.length >= 100 && BACKUP_SCENARIOS.length <= 160,
    `catalog has ${BACKUP_SCENARIOS.length} scenarios`,
  );
});

test("every scenario id is unique", () => {
  const seen = new Set();
  for (const s of BACKUP_SCENARIOS) {
    assert.ok(!seen.has(s.id), `duplicate scenario id ${s.id}`);
    seen.add(s.id);
  }
});

test("every scenario has a valid category, ballZone and targetZone", () => {
  for (const s of BACKUP_SCENARIOS) {
    assert.ok(
      SCENARIO_CATEGORIES.includes(s.category),
      `${s.id} has invalid category ${s.category}`,
    );
    assert.ok(POSITIONS.includes(s.ballZone), `${s.id} ballZone ${s.ballZone}`);
    assert.ok(
      POSITIONS.includes(s.targetZone),
      `${s.id} targetZone ${s.targetZone}`,
    );
  }
});

test("every scenario has a label, a question and an explanation that teaches", () => {
  for (const s of BACKUP_SCENARIOS) {
    assert.ok(s.label && s.label.trim().length > 0, `${s.id} has no label`);
    assert.ok(
      s.question && s.question.trim().length > 10,
      `${s.id} question is too short`,
    );
    // The content bar is "the explanation teaches the why", not just names a
    // position. 60 characters is a floor, not a standard — it catches stubs.
    assert.ok(
      s.explanation && s.explanation.trim().length >= 60,
      `${s.id} explanation is too short to teach anything`,
    );
  }
});

test("runners is always a complete three-base object of booleans", () => {
  for (const s of BACKUP_SCENARIOS) {
    for (const base of ["first", "second", "third"]) {
      assert.equal(
        typeof s.runners[base],
        "boolean",
        `${s.id} runners.${base} is not a boolean`,
      );
    }
    assert.deepEqual(
      Object.keys(s.runners).sort(),
      ["first", "second", "third"],
      `${s.id} has unexpected keys in runners`,
    );
  }
});

test("ballReachesTarget is false for pure backup/standby answers", () => {
  // A scenario whose question asks who "backs up" something is describing a
  // position that doesn't receive the ball in the depicted moment — animating
  // a throw there would teach the wrong thing.
  for (const s of BACKUP_SCENARIOS) {
    const asksForBackup = /back(s)? (up|it up)|backing up|behind the (bag|catcher|play)/i.test(
      s.question,
    );
    if (asksForBackup)
      assert.equal(
        s.ballReachesTarget,
        false,
        `${s.id} asks for a backup role but animates a throw`,
      );
  }
});

test("every category is well represented", () => {
  for (const category of SCENARIO_CATEGORIES) {
    const n = BACKUP_SCENARIOS.filter((s) => s.category === category).length;
    assert.ok(n >= 20, `category ${category} only has ${n} scenarios`);
  }
});

test("every category has a display label", () => {
  for (const category of SCENARIO_CATEGORIES)
    assert.ok(CATEGORY_LABELS[category], `no label for ${category}`);
});

// A scenario "involves" a position if that position fields the play or is the
// correct answer — the same rule bundles.ts groups by.
function involving(position) {
  return BACKUP_SCENARIOS.filter(
    (s) => s.ballZone === position || s.targetZone === position,
  );
}

test("every position has enough scenarios to fill multiple sessions", () => {
  for (const position of POSITIONS) {
    const n = involving(position).length;
    assert.ok(n >= 20, `${position} only involves ${n} scenarios`);
  }
});

test("position coverage is even — no position has triple another's reps", () => {
  const counts = POSITIONS.map((p) => involving(p).length);
  assert.ok(
    Math.max(...counts) <= Math.min(...counts) * 3,
    `uneven coverage: ${JSON.stringify(
      Object.fromEntries(POSITIONS.map((p, i) => [p, counts[i]])),
    )}`,
  );
});

test("every position covers all four skills, so its bundle can mix them", () => {
  for (const position of POSITIONS) {
    const scenarios = involving(position);
    for (const category of SCENARIO_CATEGORIES) {
      const n = scenarios.filter((s) => s.category === category).length;
      assert.ok(n >= 3, `${position} has only ${n} ${category} scenarios`);
    }
  }
});

test("no two scenarios share the same label", () => {
  const seen = new Map();
  for (const s of BACKUP_SCENARIOS) {
    assert.ok(!seen.has(s.label), `${s.id} reuses label of ${seen.get(s.label)}`);
    seen.set(s.label, s.id);
  }
});

test("no two scenarios ask the identical question", () => {
  const seen = new Map();
  for (const s of BACKUP_SCENARIOS) {
    const key = s.question.trim().toLowerCase();
    assert.ok(!seen.has(key), `${s.id} duplicates question of ${seen.get(key)}`);
    seen.set(key, s.id);
  }
});
