#!/usr/bin/env node
// Standalone assertion that B2 is fixed — MERGE-PLAN.md §0.3, §2.5.
//
// Usage: node scripts/test-player-identity.mjs
//
// No test framework, no new dependency, no network, no database. It compiles
// the two real source files with the repo's own TypeScript and exercises the
// real computePlayerTendencies — not a copy of it. Compiling to CommonJS in a
// temp dir is what makes the extensionless relative imports resolve under
// plain node.
//
// ⚠️ WHAT THIS DOES AND DOES NOT PROVE.
// It runs against the STATIC alias map in src/lib/coach/player-name.ts, which
// already contains jackson -> Jack. So this is NOT evidence that Jack and
// Jackson are really the same child — that question is open and is Stuart's to
// answer (see supabase/migrations/003_seed_roster.sql). What it proves is that
// computePlayerTendencies now APPLIES the map at all, which it previously did
// not: it keyed playerMap on the raw `pin.batter` string.
//
// Hence the assertions check the merged row's identity and its total, not just
// "there is one row" — a row count alone would pass for the wrong reasons
// (e.g. if the function dropped unrecognized batters instead of merging them).

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "warriors-player-identity-"));

try {
  execFileSync(
    "npx",
    [
      "tsc",
      "src/lib/coach/analytics.ts",
      "src/lib/coach/player-name.ts",
      "--outDir", outDir,
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--skipLibCheck",
    ],
    { cwd: root, stdio: "inherit" },
  );

  const require = createRequire(import.meta.url);
  const { computePlayerTendencies } = require(path.join(outDir, "analytics.js"));
  const { canonicalPlayerName, primeAliasCache, clearAliasCache } = require(
    path.join(outDir, "player-name.js"),
  );

  // Minimal EventPin rows. Shape matches src/lib/coach/game-types.ts.
  const pin = (id, batter, result, zone, battingTeam = "outlaws") => ({
    id, batter, result, zone, x: 50, y: 50, inning: 1, battingTeam,
  });

  // The B2 scenario as it actually occurred: one kid, two spellings, plus an
  // unrelated teammate and an opponent who must not be swept in.
  const pins = [
    pin(1, "Jack", "single", "left_field"),
    pin(2, "Jackson", "double", "left_field"),
    pin(3, "Jackson", "out", "center_field"),
    pin(4, "Kellen", "single", "right_field"),
    pin(5, "Jack", "single", "left_field"),
    pin(6, "Jack", "out", "shortstop", "opponent"),
  ];

  // --- 1. Both spellings collapse into one row, under the canonical name ----
  const rows = computePlayerTendencies(pins, "outlaws");
  const names = rows.map((r) => r.batter).sort();
  assert.deepEqual(names, ["Jack", "Kellen"], `expected Jack + Kellen, got ${names.join(", ")}`);

  const jack = rows.find((r) => r.batter === "Jack");
  assert.ok(jack, "no row keyed 'Jack'");
  assert.equal(jack.batter, "Jack", "merged row must use the canonical name, not the raw string");

  // --- 2. Nothing is lost in the merge ------------------------------------
  // 4 Outlaws plate appearances across both spellings; the opponent 'Jack' at
  // id 6 is a different person's at-bat and is filtered out by battingTeam.
  assert.equal(jack.total, 4, `expected 4 merged plate appearances, got ${jack.total}`);
  assert.equal(jack.onBase, 3, `expected 3 on-base, got ${jack.onBase}`);
  assert.equal(jack.zones.left_field.total, 3, "left_field must aggregate across both spellings");
  assert.equal(jack.zones.center_field.total, 1, "the Jackson-only zone must survive the merge");
  assert.equal(jack.favoriteZone, "left_field");

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  assert.equal(total, 5, "merging must not drop or duplicate Outlaws plate appearances");

  // --- 3. Regression guard: the raw-key bug is genuinely gone --------------
  // Before the fix this returned 3 rows (Jack / Jackson / Kellen).
  assert.equal(rows.length, 2, `expected 2 distinct hitters, got ${rows.length}`);

  // --- 4. The runtime cache overrides the static map ----------------------
  // The seam migration 001's player_aliases table will feed. Asserted here
  // because nothing exercises it yet — the table is unapplied.
  try {
    assert.equal(canonicalPlayerName("Jackson"), "Jack", "static map should resolve Jackson");
    primeAliasCache({ "  JACKSON ": "Jackson Smith", jack: "Jack" });
    assert.equal(
      canonicalPlayerName("jackson"),
      "Jackson Smith",
      "primed cache must take precedence over the static map (and key on lower(btrim(x)))",
    );
    assert.equal(canonicalPlayerName("Levi"), "Levi", "unknown names still pass through verbatim");

    // The discriminating case for the withheld-alias rule: 'linc' IS in the
    // static map (-> Lincoln) but is absent from this primed cache, mirroring
    // a player_aliases table seeded without the three unconfirmed pairs. A
    // primed cache must not fall back to the static map, or the app layer
    // silently re-applies the merge that 003 deliberately withheld.
    assert.equal(
      canonicalPlayerName("Linc"),
      "Linc",
      "a primed cache must NOT fall back to the static map on a miss",
    );
  } finally {
    clearAliasCache();
  }
  assert.equal(canonicalPlayerName("Jackson"), "Jack", "clearing the cache restores static behaviour");

  console.log("PASS — 4 checks: Jack/Jackson merge to one canonical row (total 4, on-base 3),");
  console.log("       zones aggregate, opponents excluded, and the alias cache overrides the map.");
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
