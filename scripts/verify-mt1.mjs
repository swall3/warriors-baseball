// MT-1 verification harness — MULTI-TENANT-PLAN.md MT-1 step 6.
//
// Not part of the app build. Drives a real browser because the three things
// MT-1 can break are all client-side and all invisible to `tsc` and to a
// server-rendered 200:
//
//   1. A pre-006 localStorage blob must still load. This is the only check
//      that exercises the compat readers, and a fresh browser profile proves
//      nothing — it has no legacy blob to mis-read. So the run seeds one.
//   2. The 119 historical events must still aggregate after the rename.
//   3. Every coach page must be free of runtime console errors, which a
//      status code cannot tell you.
//
//   node scripts/verify-mt1.mjs [passcode]
//   BASE=http://localhost:3099 node scripts/verify-mt1.mjs localtest
import { chromium } from "/home/swall/.local/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs";
import { rmSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3099";
const PASSCODE = process.argv[2] || process.env.APP_PASSCODE || "localtest";

const PAGES = [
  ["/coach", "live scoring"],
  ["/coach/dashboard", "dashboard"],
  ["/coach/stats", "stats"],
  ["/coach/intel", "intel"],
  ["/coach/import", "import"],
  ["/coach/lineup", "lineup"],
  ["/coach/login", "login"],
];

// A blob in the exact pre-006 shape: outlawsLineup / outlawsAreHome /
// battingTeam:"outlaws" / stateAfter.outlawsRuns. This is what is sitting in
// Stuart's phone right now.
const LEGACY_BLOB = {
  inning: 3,
  outs: 1,
  ourRuns: 7,
  oppRuns: 4,
  batter: "#22",
  oppBatter: "#9",
  selectedResult: "single",
  teamAtBat: "outlaws",
  outlawsLineup: ["#22", "#31", "#41", "#99", "#7"],
  opponentsLineup: ["#9", "#10"],
  outlawsAreHome: true,
  opponentTeamName: "Legacy Opponents",
  gameFormat: "coach_pitch",
  bases: { first: null, second: null, third: null },
  pins: [
    { id: 1, batter: "#22", result: "single", zone: "left_field", x: 24, y: 40, inning: 1, battingTeam: "outlaws" },
    { id: 2, batter: "#31", result: "out", zone: "shortstop", x: 44, y: 56, inning: 1, battingTeam: "outlaws" },
    { id: 3, batter: "#9", result: "double", zone: "right_field", x: 78, y: 30, inning: 2, battingTeam: "opponent" },
    { id: 4, batter: "#10", result: "strikeout", zone: "catcher_zone", x: 50, y: 82, inning: 2, battingTeam: "wahoos" },
  ],
  eventsV2: [
    {
      id: "evt-1", eventType: "ball_in_play", timestamp: "2026-09-01T00:00:00.000Z",
      inning: 1, batter: "#22", battingTeam: "outlaws", result: "single",
      zone: "left_field", x: 24, y: 40, description: "#22 single",
      stateAfter: { outs: 0, outlawsRuns: 3, opponentRuns: 0, bases: { first: "#22", second: null, third: null } },
    },
    {
      id: "evt-2", eventType: "ball_in_play", timestamp: "2026-09-01T00:05:00.000Z",
      inning: 2, batter: "#9", battingTeam: "opponent", result: "double",
      zone: "right_field", x: 78, y: 30, description: "#9 double",
      stateAfter: { outs: 0, outlawsRuns: 3, opponentRuns: 2, bases: { first: null, second: "#9", third: null } },
    },
  ],
};

// Console noise that is NOT MT-1's. Each was reproduced against commit 87f3c6f
// (the commit immediately before the rename) by building it into /tmp and
// running this same probe, so they are recorded rather than suppressed:
//
//   - /images/field-bg-combined-final.jpg 404 on /coach. The live-scoring
//     field background. `coach/page.tsx:1017` asks for `/images/...` but the
//     file is at `public/coach/images/...` — the `/coach` prefix was dropped
//     when the page was ported (commit d436a8d). spray-chart.tsx:45 has the
//     correct path. Real bug, unrelated to the rename, left for its own fix.
//   - React #418 hydration mismatch on /coach/dashboard and /coach/import.
//     Both render `new Date()` / `Date.now()` during the first paint.
//
// Anything not matching these fails the run.
const KNOWN_PREEXISTING = [
  /field-bg-combined-final\.jpg/,
  /Minified React error #418/,
  // The console message that accompanies the 404 above. It does not name the
  // URL, which is why failed responses are also recorded by URL below; this
  // entry only stops the same event being counted twice.
  /Failed to load resource: the server responded with a status of 404/,
];
const isKnown = (text) => KNOWN_PREEXISTING.some((re) => re.test(text));

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

// playwright-core here defaults to a headless-shell revision that is not the
// one installed on this machine, so point at the chromium that actually exists.
// The run syncs two throwaway games. When Supabase is unconfigured those land
// in data/local-db.json, and a second run would then count 122 events instead
// of 119 and look like a regression. Clear the scratch file so the run is
// repeatable. It is gitignored, regenerates from the bundled seed, and is never
// the source of truth — but skip it with KEEP_LOCAL_DB=1 if a real local
// dataset is sitting there.
if (!process.env.KEEP_LOCAL_DB) {
  rmSync(new URL("../data/local-db.json", import.meta.url), { force: true });
}

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/home/swall/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
});
const ctx = await browser.newContext();
const page = await ctx.newPage();

// The console message for a failed subresource does not name the URL, so
// failed responses are recorded separately — otherwise the pre-existing
// field-background 404 is indistinguishable from a new one.
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`${page.url()} :: ${m.text()}`);
});
page.on("pageerror", (e) => consoleErrors.push(`${page.url()} :: ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) consoleErrors.push(`${page.url()} :: HTTP ${r.status()} ${r.url()}`);
});

// ── Login through the real form ─────────────────────────────────────────────
await page.goto(`${BASE}/coach/login`, { waitUntil: "networkidle" });
await page.fill('input[type="password"]', PASSCODE);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
check("login through /coach/login form", true, `landed on ${new URL(page.url()).pathname}`);

// ── 1. Every coach page renders with no console error ───────────────────────
for (const [path, label] of PAGES) {
  const before = consoleErrors.length;
  const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const newErrors = consoleErrors.slice(before);
  const novel = newErrors.filter((e) => !isKnown(e));
  const bodyLen = (await page.textContent("body"))?.length ?? 0;
  check(
    `page renders: ${path} (${label})`,
    res.status() === 200 && novel.length === 0 && bodyLen > 200,
    `HTTP ${res.status()}, ${bodyLen} chars of text, ${novel.length} new console errors` +
      `${newErrors.length - novel.length ? ` (${newErrors.length - novel.length} known pre-existing)` : ""}` +
      `${novel.length ? `: ${novel.join(" | ")}` : ""}`,
  );
}

// ── 2. The 119 historical events still aggregate on /coach/stats ────────────
// localStorage is empty here, so every pin on the page comes from the DB-backed
// /api/coach/games. Expected values are computed from the same 119 rows.
await page.goto(`${BASE}/coach/stats`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const statsText = (await page.textContent("body")) || "";
const num = (label) => {
  const m = statsText.match(new RegExp(`${label}\\s*([0-9]+)`, "i"));
  return m ? Number(m[1]) : null;
};
const statsAll = await page.evaluate(async () => {
  const r = await fetch("/api/coach/games");
  const j = await r.json();
  const pins = j.games.flatMap((g) => g.pins || []);
  const us = pins.filter((p) => !p.battingTeam || p.battingTeam === "us");
  const H = ["single", "double", "triple", "home_run"];
  const O = ["out", "fielders_choice", "strikeout"];
  return {
    total: pins.length,
    us: us.length,
    hits: us.filter((p) => H.includes(p.result)).length,
    outs: us.filter((p) => O.includes(p.result)).length,
  };
});
check(
  "119 historical events reach /coach/stats after the rename",
  statsAll.total === 119 && statsAll.us === 59 && statsAll.hits === 35 && statsAll.outs === 22,
  `total=${statsAll.total} (expect 119), us=${statsAll.us} (59), hits=${statsAll.hits} (35), outs=${statsAll.outs} (22)`,
);
check(
  "/coach/stats renders those aggregates",
  statsText.includes("59") && statsText.includes("35"),
  `page text contains total-plays 59: ${statsText.includes("59")}, hits 35: ${statsText.includes("35")}`,
);

// ── 3. A pre-006 localStorage blob still loads ──────────────────────────────
//
// REWRITTEN IN MT-3. This section used to seed the blob under
// `outlaws-field-app:v1`, reload, and read that SAME key back expecting the app
// to have rewritten it in the new vocabulary. MT-3's T7 rename changed both
// halves of that: the app now reads and writes `coach:<orgId>:state:v1`, and it
// COPIES the legacy key rather than moving it — the original is deliberately
// left byte-for-byte intact as the only recoverable backup of an in-progress
// game (src/lib/coach/storage-keys.ts, §6.4). So the old assertions would now
// fail for a correct app.
//
// ⚠️ THE ORDER BELOW MATTERS AND IS NOT INCIDENTAL. localStorage is cleared
// first, then the legacy blob is planted, and only THEN is /coach opened. That
// is the real device's sequence: a phone that has not loaded the new build yet
// holds a legacy blob and nothing else. Doing it the other way round — opening
// the app first, planting the blob second — is how the previous version of this
// section produced six red checks against a working app: the first load wrote a
// default empty state to the new key, and the migration then correctly declined
// to overwrite it. That is the no-overwrite rule doing its job, not a bug, but
// it is also not a sequence any real browser can be in.
await page.evaluate((blob) => {
  window.localStorage.clear();
  window.localStorage.setItem("outlaws-field-app:v1", JSON.stringify(blob));
}, LEGACY_BLOB);
await page.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const migrated = await page.evaluate(() => {
  const NEW_KEY = "coach:org-outlaws:state:v1";
  const parse = (k) => {
    const raw = window.localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  };
  const current = parse(NEW_KEY);
  const legacy = parse("outlaws-field-app:v1");
  return {
    newKeyExists: current !== null,
    legacyStillThere: legacy !== null,
    legacyRaw: window.localStorage.getItem("outlaws-field-app:v1"),
    keys: current ? Object.keys(current).sort() : [],
    usLineup: current?.usLineup,
    usAreHome: current?.usAreHome,
    ourRuns: current?.ourRuns,
    oppRuns: current?.oppRuns,
    battingTeams: [...new Set((current?.pins || []).map((p) => p.battingTeam))].sort(),
    eventUsRuns: (current?.eventsV2 || []).map((e) => e.stateAfter.usRuns),
  };
});

check(
  "T7 migration: the legacy blob was copied to the org-namespaced key",
  migrated.newKeyExists,
  "coach:org-outlaws:state:v1",
);
check(
  "T7 migration: the legacy key is LEFT IN PLACE, byte for byte (§6.4 — the only backup)",
  migrated.legacyStillThere && migrated.legacyRaw === JSON.stringify(LEGACY_BLOB),
  migrated.legacyStillThere ? "unchanged" : "GONE — an in-progress game would be unrecoverable",
);
check(
  "legacy blob: batting order survives (outlawsLineup -> usLineup)",
  JSON.stringify(migrated.usLineup) === JSON.stringify(LEGACY_BLOB.outlawsLineup),
  `usLineup=${JSON.stringify(migrated.usLineup)}`,
);
check(
  "legacy blob: home/away survives (outlawsAreHome -> usAreHome)",
  migrated.usAreHome === true,
  `usAreHome=${migrated.usAreHome}`,
);
check(
  "legacy blob: score survives",
  migrated.ourRuns === 7 && migrated.oppRuns === 4,
  `ourRuns=${migrated.ourRuns}, oppRuns=${migrated.oppRuns}`,
);
check(
  "legacy blob: pin vocabulary normalised (outlaws/opponent/wahoos -> us/them)",
  JSON.stringify(migrated.battingTeams) === JSON.stringify(["them", "us"]),
  `battingTeam values now ${JSON.stringify(migrated.battingTeams)}`,
);
check(
  "legacy blob: event-log running score survives (outlawsRuns -> usRuns)",
  JSON.stringify(migrated.eventUsRuns) === JSON.stringify([3, 3]),
  `stateAfter.usRuns=${JSON.stringify(migrated.eventUsRuns)}`,
);
check(
  "legacy blob: the rewritten blob no longer carries the old keys",
  !migrated.keys.includes("outlawsLineup") && !migrated.keys.includes("outlawsAreHome"),
  `keys=${migrated.keys.join(",")}`,
);

// Whole-body text, not just <button> text — the batting order is rendered in
// the lineup list, which is not a button. This is the check that matters most:
// the blob being in the right key proves the migration, but only the screen
// proves the coach can still see the game.
const bodyText = (await page.textContent("body")) || "";
const missing = LEGACY_BLOB.outlawsLineup.filter((j) => !bodyText.includes(j));
check(
  "legacy blob: the revived batting order is on screen",
  missing.length === 0,
  missing.length ? `missing ${missing.join(", ")}` : `all of ${LEGACY_BLOB.outlawsLineup.join(", ")} rendered`,
);
check(
  "legacy blob: the revived score and opponent name are on screen",
  bodyText.includes("Legacy Opponents") && bodyText.includes("7"),
  `opponent name: ${bodyText.includes("Legacy Opponents")}, our score 7: ${bodyText.includes("7")}`,
);

// ── 4. Log a game end to end and sync it ────────────────────────────────────
const testGameId = `mt1-verify-${Date.now()}`;
const sync = await page.evaluate(async (id) => {
  const game = {
    id,
    label: "MT-1 verification game",
    date: new Date().toISOString(),
    opponentTeamName: "MT1 Verify Opponents",
    score: { us: 5, opponents: 3 },
    schemaVersion: 2,
    usAreHome: true,
    pins: [
      { id: 1, batter: "#22", result: "home_run", zone: "center_field", x: 50, y: 28, inning: 1, battingTeam: "us" },
      { id: 2, batter: "#9", result: "out", zone: "shortstop", x: 44, y: 56, inning: 1, battingTeam: "them" },
    ],
    eventsV2: [
      {
        id: "v-1", eventType: "ball_in_play", timestamp: new Date().toISOString(),
        inning: 1, batter: "#22", battingTeam: "us", result: "home_run",
        zone: "center_field", x: 50, y: 28, description: "#22 home run",
        stateAfter: { outs: 0, usRuns: 5, opponentRuns: 3, bases: { first: null, second: null, third: null } },
      },
      {
        id: "v-2", eventType: "ball_in_play", timestamp: new Date().toISOString(),
        inning: 1, batter: "#9", battingTeam: "them", result: "out",
        zone: "shortstop", x: 44, y: 56, description: "#9 out",
        stateAfter: { outs: 1, usRuns: 5, opponentRuns: 3, bases: { first: null, second: null, third: null } },
      },
    ],
  };
  const r = await fetch("/api/coach/sync/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game }),
  });
  return { status: r.status, body: await r.json() };
}, testGameId);
check(
  "a game logs and syncs end to end",
  sync.status === 200 && sync.body.ok === true && sync.body.syncedEvents === 2,
  `HTTP ${sync.status} ${JSON.stringify(sync.body)}`,
);

const readback = await page.evaluate(async (id) => {
  const r = await fetch("/api/coach/games");
  const j = await r.json();
  const g = j.games.find((x) => x.id === id);
  return g ? { score: g.score, usAreHome: g.usAreHome, teams: (g.pins || []).map((p) => p.battingTeam) } : null;
}, testGameId);
check(
  "the synced game reads back in the new vocabulary",
  readback &&
    readback.score.us === 5 &&
    readback.score.opponents === 3 &&
    readback.usAreHome === true &&
    JSON.stringify(readback.teams.sort()) === JSON.stringify(["them", "us"]),
  JSON.stringify(readback),
);

// ── 5. An OLD-shape payload still syncs (deploy-window tolerance) ───────────
const legacySync = await page.evaluate(async (id) => {
  const game = {
    id,
    label: "MT-1 legacy-payload game",
    date: new Date().toISOString(),
    opponentTeamName: "MT1 Legacy Opponents",
    score: { outlaws: 9, opponents: 2 },
    schemaVersion: 2,
    outlawsAreHome: true,
    pins: [{ id: 1, batter: "#41", result: "triple", zone: "left_center", x: 34, y: 20, inning: 1, battingTeam: "outlaws" }],
    eventsV2: [
      {
        id: "lv-1", eventType: "ball_in_play", timestamp: new Date().toISOString(),
        inning: 1, batter: "#41", battingTeam: "outlaws", result: "triple",
        zone: "left_center", x: 34, y: 20, description: "#41 triple",
        stateAfter: { outs: 0, outlawsRuns: 9, opponentRuns: 2, bases: { first: null, second: null, third: "#41" } },
      },
    ],
  };
  const r = await fetch("/api/coach/sync/game", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game }),
  });
  const post = await r.json();
  const all = await (await fetch("/api/coach/games")).json();
  const g = all.games.find((x) => x.id === id);
  return { post, stored: g ? { score: g.score, usAreHome: g.usAreHome, teams: (g.pins || []).map((p) => p.battingTeam) } : null };
}, `mt1-legacy-${Date.now()}`);
check(
  "a PRE-006 payload still syncs and lands in the new vocabulary",
  legacySync.post.ok === true &&
    legacySync.stored?.score.us === 9 &&
    legacySync.stored?.usAreHome === true &&
    JSON.stringify(legacySync.stored?.teams) === JSON.stringify(["us"]),
  JSON.stringify(legacySync.stored),
);

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (consoleErrors.length) console.log(`console errors seen:\n  ${consoleErrors.join("\n  ")}`);
process.exit(failed.length === 0 ? 0 : 1);
