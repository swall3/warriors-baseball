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

// ── Answer-isolation guards (leak fix) ────────────────────────────────────
// The client-safe catalog must never let a browser recover answer fields.
import {
  SCENARIO_CATALOG,
  SCENARIO_CATALOG_BY_ID,
  BUNDLE_SUMMARIES,
} from "../src/lib/scenarioCatalog.ts";
import { POSITION_PRACTICE_BUNDLE_SUMMARIES } from "../src/lib/practice/bundleSummaries.ts";

const ANSWER_KEYS = ["question", "targetZone", "explanation"];

test("generated catalog stays in sync with the pool's safe fields", () => {
  assert.equal(
    SCENARIO_CATALOG.length,
    BACKUP_SCENARIOS.length,
    "catalog is stale — run scripts/gen-scenario-catalog.mjs",
  );
  for (const s of BACKUP_SCENARIOS) {
    const c = SCENARIO_CATALOG_BY_ID[s.id];
    assert.ok(c, `catalog missing ${s.id} — regenerate the catalog`);
    assert.equal(c.label, s.label);
    assert.equal(c.category, s.category);
    assert.equal(c.ballZone, s.ballZone);
    assert.deepEqual(c.runners, s.runners);
  }
});

test("no client-safe scenario object carries an answer field", () => {
  for (const c of SCENARIO_CATALOG)
    for (const k of ANSWER_KEYS)
      assert.ok(!(k in c), `catalog entry ${c.id} leaks answer field ${k}`);
});

test("client bundle summaries expose no scenarioId lists", () => {
  for (const b of POSITION_PRACTICE_BUNDLE_SUMMARIES) {
    assert.ok(!("scenarioIds" in b), `${b.id} leaks scenarioIds`);
    assert.equal(typeof b.scenarioCount, "number");
  }
});

test("targetZone cannot be recovered from client-only data", () => {
  // An attacker holds SCENARIO_CATALOG (has ballZone) + BUNDLE_SUMMARIES
  // (counts only). Without per-scenario membership, no targetZone is derivable.
  for (const [, summary] of Object.entries(BUNDLE_SUMMARIES)) {
    assert.ok(!("scenarioIds" in summary));
    assert.ok(!("ids" in summary));
  }
  // Nothing in the client catalog references targetZone.
  const serialized = JSON.stringify({ SCENARIO_CATALOG, BUNDLE_SUMMARIES });
  for (const s of BACKUP_SCENARIOS)
    assert.ok(
      !serialized.includes(s.explanation) && !serialized.includes(s.question),
      `client data contains answer text for ${s.id}`,
    );
});

// ── Server↔client bundle parity ───────────────────────────────────────────
// The generator (client summaries) and bundles.ts (server membership) derive
// the same rule independently. Assert they never drift, or the picker's rep
// counts would disagree with what the server assigns.
import { POSITION_PRACTICE_BUNDLES } from "../src/lib/practice/bundles.ts";

test("client bundle summaries match server bundle membership", () => {
  const summaryById = Object.fromEntries(
    POSITION_PRACTICE_BUNDLE_SUMMARIES.map((b) => [b.id, b]),
  );
  assert.equal(
    POSITION_PRACTICE_BUNDLE_SUMMARIES.length,
    POSITION_PRACTICE_BUNDLES.length,
    "bundle count drift — regenerate the catalog",
  );
  for (const server of POSITION_PRACTICE_BUNDLES) {
    const client = summaryById[server.id];
    assert.ok(client, `client summary missing ${server.id}`);
    assert.equal(
      client.scenarioCount,
      server.scenarioIds.length,
      `${server.id} count drift`,
    );
    assert.deepEqual(client.categoryCounts, server.categoryCounts);
    assert.equal(client.position, server.position);
  }
});

test("catalog sync also covers ballReachesTarget", () => {
  for (const s of BACKUP_SCENARIOS) {
    const c = SCENARIO_CATALOG_BY_ID[s.id];
    assert.equal(
      c.ballReachesTarget ?? undefined,
      s.ballReachesTarget ?? undefined,
      `${s.id} ballReachesTarget drift`,
    );
  }
});
