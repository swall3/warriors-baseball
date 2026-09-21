#!/usr/bin/env node
// MT-3 verification harness — MULTI-TENANT-PLAN.md §7 MT-3 step 6.
//
//   node scripts/verify-mt3.mjs
//
// MT-3's gate is "a second tenant can be onboarded by hand and is genuinely
// isolated", and step 6 insists the isolation be confirmed "at the database
// level by running a scoped query directly, not just by looking at the UI".
// Following verify-mt1.mjs / verify-mt2.mjs, the checks are grouped by WHERE
// they would fail, because each layer needs a different instrument:
//
//   LAYER 1 — SESSION CRYPTO. src/lib/coach/session.ts as plain functions in
//     plain node (it imports nothing, which is what makes this possible).
//     Round-trip, tamper, expiry, wrong secret, forged role. This is the layer
//     where "orgId is a claim the server issued" is either true or isn't.
//
//   LAYER 2 — HASH AGREEMENT. scripts/create-org.mjs computes a passcode hash
//     and src/lib/coach/auth.ts computes one; if their salts ever diverge,
//     every provisioned passcode silently stops working and the only symptom
//     is "wrong passcode".
//
//   LAYER 3 — LOCALSTORAGE (T7/M12). storage-keys.ts against a Map-backed fake
//     Storage holding a genuine PRE-006-shaped blob — old key AND old field
//     names together, which is what Stuart's phone would actually have. §6.4
//     calls this the highest-risk item in the plan; it gets the most checks.
//
//   LAYER 4 — DATABASE. org_passcodes' shape, the partial unique index
//     actually refusing a cross-org collision, and the two tenants' row counts
//     read straight from Postgres.
//
//   LAYER 5 — END TO END, over HTTP, against the real database. Builds and
//     starts the app, logs in as each tenant, and checks what each one's
//     session can see. This is the layer that answers the two questions this
//     phase exists for: does org-outlaws' login still behave EXACTLY as before,
//     and does Talking Baseball see nothing of org-outlaws'.
//
// ⚠️ LAYER 5 TALKS TO THE LIVE PROJECT, deliberately. verify-mt2.mjs explains
// why a browser test would have been a green check that tested nothing there:
// this worktree's .env.local has no SUPABASE_URL, so the app falls through to
// seed-db.json and every tenant looks empty for the wrong reason. So layer 5
// fetches the project's URL and keys from the Management API at RUN TIME using
// the SUPABASE_MGMT_TOKEN already present, hands them to the child process, and
// never writes them to disk.
//
// Its writes are confined to the DEMO tenant (org-talking-baseball) and are
// deleted in a finally block. It never writes to org-outlaws — the whole point
// is that Stuart's live data is untouched, and a harness that wrote to it to
// prove that would be absurd.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { runSql, trySql, readMgmtToken, ROOT, PROJECT_REF } from "./lib/sql.mjs";

const OWNER_ORG = "org-outlaws";
const DEMO_ORG = "org-talking-baseball";
const PORT = Number(process.env.PORT || 3099);
const BASE = `http://127.0.0.1:${PORT}`;
const LOCAL_PASSCODE = "localtest"; // stands in for Stuart's APP_PASSCODE
const AUTH_SALT = "ec-coach-auth";

let passed = 0;
const failures = [];

function check(label, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function eq(label, actual, expected) {
  check(
    label,
    actual === expected,
    `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ===========================================================================
// LAYER 1 — the signed session
// ===========================================================================
async function layer1() {
  console.log("\nLAYER 1 — session crypto (§3.2)");
  const S = await import("../src/lib/coach/session.ts");
  const SECRET = "test-secret-do-not-use-anywhere";
  const THIRTY_DAYS = 60 * 60 * 24 * 30;
  const now = 1_700_000_000;

  const token = await S.signSession({ orgId: DEMO_ORG, role: "coach" }, SECRET, THIRTY_DAYS, now);

  const ok = await S.verifySession(token, SECRET, now + 10);
  eq("round trip preserves orgId", ok?.orgId, DEMO_ORG);
  eq("round trip preserves role", ok?.role, "coach");
  eq("exp is iat + maxAge (30 days — unchanged from MT-2)", ok?.exp, now + THIRTY_DAYS);

  eq("wrong secret rejected", await S.verifySession(token, "other-secret", now), null);
  eq("null secret rejected (fails closed)", await S.verifySession(token, null, now), null);
  eq("missing cookie rejected", await S.verifySession(undefined, SECRET, now), null);
  eq("expired session rejected", await S.verifySession(token, SECRET, now + THIRTY_DAYS + 1), null);

  // The attack this design exists to stop: rewrite the org and keep the old
  // signature. Without the HMAC this is a one-line tenancy bypass.
  const [payloadB64, sig] = token.split(".");
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  const swapped = Buffer.from(JSON.stringify({ ...payload, orgId: OWNER_ORG })).toString(
    "base64url",
  );
  eq(
    "payload rewritten to another org is rejected",
    await S.verifySession(`${swapped}.${sig}`, SECRET, now),
    null,
  );
  eq(
    "flipped signature byte is rejected",
    await S.verifySession(`${payloadB64}.${sig.slice(0, -1)}${sig.slice(-1) === "A" ? "B" : "A"}`, SECRET, now),
    null,
  );

  // Signed by the right key, but claiming something the type system forbids.
  const badRole = await S.signSession({ orgId: DEMO_ORG, role: "superuser" }, SECRET, 60, now);
  eq("unknown role rejected even when correctly signed", await S.verifySession(badRole, SECRET, now), null);
  const noOrg = await S.signSession({ orgId: "", role: "coach" }, SECRET, 60, now);
  eq("empty orgId rejected even when correctly signed", await S.verifySession(noOrg, SECRET, now), null);

  for (const garbage of ["", ".", "abc", "a.b", "....", "eyJhIjoxfQ"]) {
    const result = await S.verifySession(garbage, SECRET, now);
    check(`garbage cookie ${JSON.stringify(garbage)} returns null without throwing`, result === null);
  }
}

// ===========================================================================
// LAYER 2 — the passcode hash, in two places
// ===========================================================================
async function layer2() {
  console.log("\nLAYER 2 — passcode hash agreement");
  const authSrc = fs.readFileSync(path.join(ROOT, "src/lib/coach/auth.ts"), "utf8");
  const createSrc = fs.readFileSync(path.join(ROOT, "scripts/create-org.mjs"), "utf8");
  const seedSrc = fs.readFileSync(path.join(ROOT, "scripts/seed-owner-passcode.mjs"), "utf8");

  const saltOf = (src) => src.match(/AUTH_SALT\s*=\s*"([^"]+)"/)?.[1];
  eq("auth.ts salt", saltOf(authSrc), AUTH_SALT);
  eq("create-org.mjs uses the same salt", saltOf(createSrc), AUTH_SALT);
  eq("seed-owner-passcode.mjs uses the same salt", saltOf(seedSrc), AUTH_SALT);

  for (const src of [authSrc, createSrc, seedSrc]) {
    check(
      "hash is sha256(`${AUTH_SALT}:${passcode}`) hex",
      /\$\{AUTH_SALT\}:\$\{/.test(src) && /padStart\(2, "0"\)/.test(src),
    );
  }

  // And the value itself, computed independently of all three.
  const expected = sha256Hex(`${AUTH_SALT}:hello`);
  const { execFileSync } = await import("node:child_process");
  const actual = execFileSync(
    process.execPath,
    [
      "-e",
      `const c=require('node:crypto');c.subtle.digest('SHA-256',new TextEncoder().encode('${AUTH_SALT}:hello')).then(d=>process.stdout.write(Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join('')))`,
    ],
    { encoding: "utf8" },
  );
  eq("crypto.subtle path produces the same hex as node:crypto", actual, expected);
}

// ===========================================================================
// LAYER 3 — localStorage namespacing (T7 / §6.4 / M12)
// ===========================================================================
// The blob below is the thing this layer exists for: the OLD key holding the
// OLD field shape. `outlawsLineup`, `outlawsRuns` and battingTeam:"outlaws" are
// what a phone that has not opened the app since before migration 006 actually
// contains. Testing the rename against a modern blob would pass while leaving
// the real case broken.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
  };
}

async function layer3() {
  console.log("\nLAYER 3 — localStorage keys + legacy migration (T7, §6.4)");
  const SK = await import("../src/lib/coach/storage-keys.ts");
  const GT = await import("../src/lib/coach/game-types.ts");

  const LEGACY_STATE = "outlaws-field-app:v1";
  const LEGACY_HISTORY = "outlaws-field-app:games:v1";
  const LEGACY_PLAN = "warriors-coach:lineup-plan:v1";

  eq("legacy state key unchanged from what shipped", SK.LEGACY_COACH_STORAGE_KEYS.state, LEGACY_STATE);
  eq("legacy history key unchanged", SK.LEGACY_COACH_STORAGE_KEYS.history, LEGACY_HISTORY);
  eq("legacy lineup-plan key unchanged", SK.LEGACY_COACH_STORAGE_KEYS.lineupPlan, LEGACY_PLAN);

  const keys = SK.coachStorageKeys(OWNER_ORG);
  eq("new state key is org-namespaced", keys.state, `coach:${OWNER_ORG}:state:v1`);
  eq("new history key is org-namespaced", keys.history, `coach:${OWNER_ORG}:games:v1`);
  eq("new lineup-plan key is org-namespaced", keys.lineupPlan, `coach:${OWNER_ORG}:lineup-plan:v1`);
  eq("a second org gets different keys", SK.coachStorageKeys(DEMO_ORG).state, `coach:${DEMO_ORG}:state:v1`);
  check("no orgId is an error, never a default", (() => {
    try {
      SK.coachStorageKeys("");
      return false;
    } catch {
      return true;
    }
  })());

  // --- the real case: a pre-006 blob under the pre-MT-3 key -----------------
  const preV006Blob = JSON.stringify({
    inning: 4,
    outs: 2,
    outlawsRuns: 7,
    oppRuns: 3,
    outlawsLineup: ["#11", "#3", "#22"],
    opponentsLineup: ["#9"],
    opponentTeamName: "River Hawks",
    teamAtBat: "outlaws",
    pins: [{ id: 1, x: 40, y: 30, result: "double", batter: "#11", battingTeam: "outlaws", inning: 4 }],
    eventsV2: [
      {
        id: "evt-1",
        eventType: "ball_in_play",
        battingTeam: "outlaws",
        result: "double",
        inning: 4,
        stateAfter: { outs: 2, outlawsRuns: 7, opponentRuns: 3 },
      },
    ],
  });
  const legacyHistory = JSON.stringify([{ id: "game-1", label: "vs River Hawks", pins: [] }]);
  const legacyPlan = JSON.stringify({ id: "plan-1", battingOrder: ["#11", "#3"] });

  SK.resetCoachStorageMigrationMemo();
  const store = fakeStorage({
    [LEGACY_STATE]: preV006Blob,
    [LEGACY_HISTORY]: legacyHistory,
    [LEGACY_PLAN]: legacyPlan,
  });
  const report = SK.migrateLegacyCoachStorage(OWNER_ORG, true, store);

  eq("all three legacy keys copied", report.copied.length, 3);
  eq("state copied byte-for-byte", store.getItem(keys.state), preV006Blob);
  eq("history copied byte-for-byte", store.getItem(keys.history), legacyHistory);
  eq("lineup plan copied byte-for-byte", store.getItem(keys.lineupPlan), legacyPlan);

  // Property (1): the original is still there. This is the difference between
  // a recoverable mistake and a lost game.
  eq("legacy state key LEFT IN PLACE as a backup", store.getItem(LEGACY_STATE), preV006Blob);
  eq("legacy history key left in place", store.getItem(LEGACY_HISTORY), legacyHistory);
  eq("legacy plan key left in place", store.getItem(LEGACY_PLAN), legacyPlan);

  // And the migrated blob still reads correctly through the 006 content
  // normalisers — old key AND old field names survive the move together.
  const parsed = JSON.parse(store.getItem(keys.state));
  check(
    "migrated pre-006 blob still yields the batting order (readUsLineup)",
    JSON.stringify(GT.readUsLineup(parsed)) === JSON.stringify(["#11", "#3", "#22"]),
    JSON.stringify(GT.readUsLineup(parsed)),
  );
  eq("migrated pre-006 pins still map to 'us'", GT.toTeamAtBat(parsed.pins[0].battingTeam), "us");
  eq("migrated pre-006 teamAtBat still maps to 'us'", GT.toTeamAtBat(parsed.teamAtBat), "us");
  eq("migrated pre-006 score still reads (readStateUsRuns)", GT.readStateUsRuns(parsed.eventsV2[0].stateAfter), 7);

  // Property (2): never overwrite. This is the check that would have caught the
  // ordering bug described in storage-keys.ts — an empty game written by the
  // save effect before the copy ran.
  store.map.set(keys.state, '{"inning":9}');
  const second = SK.migrateLegacyCoachStorage(OWNER_ORG, true, store);
  eq("re-run copies nothing", second.copied.length, 0);
  eq("re-run does NOT overwrite a populated destination", store.getItem(keys.state), '{"inning":9}');

  // Property (3): owner org only.
  const tbStore = fakeStorage({
    [LEGACY_STATE]: preV006Blob,
    [LEGACY_HISTORY]: legacyHistory,
    [LEGACY_PLAN]: legacyPlan,
  });
  const tbReport = SK.migrateLegacyCoachStorage(DEMO_ORG, false, tbStore);
  eq("non-owner org copies nothing", tbReport.copied.length, 0);
  eq("non-owner org reports why", tbReport.skipped, "not-owner-org");
  const tbKeys = SK.coachStorageKeys(DEMO_ORG);
  eq("org-outlaws' game does NOT land in the demo tenant's namespace", tbStore.getItem(tbKeys.state), null);
  eq("...nor its history", tbStore.getItem(tbKeys.history), null);
  eq("...nor its lineup plan", tbStore.getItem(tbKeys.lineupPlan), null);

  // A fresh browser with no legacy data at all.
  const empty = fakeStorage();
  const emptyReport = SK.migrateLegacyCoachStorage(OWNER_ORG, true, empty);
  eq("no legacy data is a clean no-op", emptyReport.skipped, "nothing-to-copy");
  eq("...and invents nothing", empty.getItem(keys.state), null);

  // A browser that cannot use storage at all must not take the app down.
  const hostile = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };
  check(
    "a throwing Storage (private mode / quota) does not propagate",
    (() => {
      try {
        SK.migrateLegacyCoachStorage(OWNER_ORG, true, hostile);
        return true;
      } catch {
        return false;
      }
    })(),
  );

  // No page may still name a legacy key directly.
  const offenders = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    if (!/\.tsx?$/.test(file)) continue;
    if (file.endsWith("storage-keys.ts")) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const line of src.split("\n")) {
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
      if (line.includes(LEGACY_STATE) || line.includes(LEGACY_HISTORY) || line.includes(LEGACY_PLAN)) {
        offenders.push(`${path.relative(ROOT, file)}: ${line.trim().slice(0, 60)}`);
      }
    }
  }
  check("no source file outside storage-keys.ts still uses a legacy key", offenders.length === 0, offenders.join(" | "));
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

// ===========================================================================
// LAYER 4 — the database
// ===========================================================================
async function layer4() {
  console.log("\nLAYER 4 — org_passcodes + tenant row counts (live database)");

  const cols = await runSql(`
    select column_name, data_type, is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'org_passcodes'
    order by ordinal_position;`);
  const names = cols.map((c) => c.column_name);
  check(
    "org_passcodes has §3.2's columns",
    ["org_id", "passcode_sha", "label", "role", "active", "created_at"].every((c) => names.includes(c)),
    names.join(","),
  );

  const [{ rls }] = await runSql(
    `select relrowsecurity as rls from pg_class where oid = 'public.org_passcodes'::regclass;`,
  );
  check("RLS is enabled on org_passcodes", rls === true);
  const policies = await runSql(
    `select policyname from pg_policies where schemaname='public' and tablename='org_passcodes';`,
  );
  // Deliberate: RLS on with ZERO policies is deny-all for anon/authenticated,
  // which is the one thing protecting a table of passcode hashes from the key
  // shipped to every browser.
  eq("org_passcodes has zero policies (deny-all for anon)", policies.length, 0);

  const idx = await runSql(
    `select indexname, indexdef from pg_indexes where schemaname='public' and tablename='org_passcodes';`,
  );
  const unique = idx.find((i) => i.indexname === "idx_org_passcodes_sha");
  check("idx_org_passcodes_sha exists", Boolean(unique), unique?.indexdef || "missing");
  check(
    "...and is UNIQUE and partial on active",
    /UNIQUE/i.test(unique?.indexdef || "") && /WHERE active/i.test(unique?.indexdef || ""),
    unique?.indexdef || "",
  );

  // The property the whole login model rests on: one active passcode cannot
  // name two orgs. Proven by trying it, not by reading the index definition.
  const collision = sha256Hex(`${AUTH_SALT}:collision-probe-${Date.now()}`);
  const first = await trySql(
    `insert into public.org_passcodes (org_id, passcode_sha, label) values ('${OWNER_ORG}', '${collision}', 'collision probe');`,
  );
  check("probe row inserted for the owner org", first.ok, first.error || "");
  const second = await trySql(
    `insert into public.org_passcodes (org_id, passcode_sha, label) values ('${DEMO_ORG}', '${collision}', 'collision probe');`,
  );
  check(
    "the SAME active passcode cannot be registered to a second org",
    !second.ok && /duplicate key|unique/i.test(second.error || ""),
    second.ok ? "INSERT SUCCEEDED — tenancy is ambiguous" : String(second.error).slice(0, 120),
  );
  await runSql(`delete from public.org_passcodes where passcode_sha = '${collision}';`);
  const [{ left }] = await runSql(
    `select count(*)::int as left from public.org_passcodes where passcode_sha = '${collision}';`,
  );
  eq("collision probe cleaned up", left, 0);

  // The two tenants, counted directly in Postgres (step 6's requirement).
  const [counts] = await runSql(`
    select
      (select count(*)::int from public.org_passcodes where org_id='${DEMO_ORG}' and active) as tb_passcodes,
      (select count(*)::int from public.teams  where org_id='${DEMO_ORG}')                   as tb_teams,
      (select count(*)::int from public.teams  where org_id='${DEMO_ORG}' and kind='own')    as tb_own_teams,
      (select count(*)::int from public.games  where org_id='${DEMO_ORG}')                   as tb_games,
      (select count(*)::int from public.players where org_id='${DEMO_ORG}')                  as tb_players,
      (select count(*)::int from public.play_events where org_id='${DEMO_ORG}')              as tb_events,
      (select count(*)::int from public.games  where org_id='${OWNER_ORG}')                  as ow_games,
      (select count(*)::int from public.players where org_id='${OWNER_ORG}')                 as ow_players,
      (select count(*)::int from public.play_events where org_id='${OWNER_ORG}')             as ow_events;`);
  console.log(`        counts: ${JSON.stringify(counts)}`);

  eq("Talking Baseball has exactly one active passcode", counts.tb_passcodes, 1);
  eq("Talking Baseball has exactly one team", counts.tb_teams, 1);
  eq("...and it is the org's OWN team (kind='own', §3.5)", counts.tb_own_teams, 1);
  eq("Talking Baseball has zero games", counts.tb_games, 0);
  eq("Talking Baseball has zero players", counts.tb_players, 0);
  eq("Talking Baseball has zero play events", counts.tb_events, 0);
  check("org-outlaws still has its games", counts.ow_games > 0, `${counts.ow_games} games`);
  check("org-outlaws still has its play events", counts.ow_events > 0, `${counts.ow_events} events`);

  return counts;
}

// ===========================================================================
// LAYER 5 — end to end over HTTP
// ===========================================================================
async function fetchProjectKeys() {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`, {
    headers: { Authorization: `Bearer ${readMgmtToken()}` },
  });
  if (!res.ok) throw new Error(`api-keys failed: HTTP ${res.status}`);
  const keys = await res.json();
  const byName = (n) => keys.find((k) => k.name === n || k.id === n)?.api_key;
  const serviceRole = byName("service_role");
  if (!serviceRole) throw new Error("service_role key not returned by the Management API");
  return { url: `https://${PROJECT_REF}.supabase.co`, serviceRole };
}

function readDemoPasscode() {
  const file = path.join(ROOT, "TALKING-BASEBALL-CREDENTIALS.txt");
  if (!fs.existsSync(file)) return null;
  const m = fs.readFileSync(file, "utf8").match(/^\s*PASSCODE:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}

function cookieFrom(res, name) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const [k, ...v] = pair.split("=");
    if (k.trim() === name) return v.join("=");
  }
  return null;
}

async function layer5(dbCounts) {
  console.log("\nLAYER 5 — end to end: two tenants, one running app");

  const demoPasscode = readDemoPasscode();
  if (!demoPasscode) {
    check("TALKING-BASEBALL-CREDENTIALS.txt is readable", false, "not found — layer 5 skipped");
    return;
  }

  // ⚠️ Refuse to run against a server this harness did not start.
  //
  // This is not defensiveness for its own sake — it is a bug this harness
  // actually had. `server.kill()` signalled the `npx` wrapper and left the
  // `next start` grandchild listening, so the NEXT run found port 3099 already
  // answering, happily tested against the previous run's process, and reported
  // three spurious failures: that server was signing cookies with the previous
  // run's SESSION_SECRET. A stale server produces failures that look like real
  // session bugs, which is the worst kind of false alarm in an auth change.
  // Hence both halves of the fix: refuse to attach, and kill the process GROUP.
  try {
    await fetch(`${BASE}/coach/login`, { redirect: "manual" });
    check(
      `nothing is already listening on ${BASE}`,
      false,
      "a server is already there — kill it; this harness must own the process it tests",
    );
    return;
  } catch {
    check(`nothing is already listening on ${BASE}`, true);
  }

  const { url, serviceRole } = await fetchProjectKeys();
  const sessionSecret = crypto.randomBytes(48).toString("base64url");

  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true, // own process group, so the kill below reaches next-server
    env: {
      ...process.env,
      NODE_ENV: "production",
      APP_PASSCODE: LOCAL_PASSCODE,
      SESSION_SECRET: sessionSecret,
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceRole,
      OWNER_ORG_ID: OWNER_ORG,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  server.stdout.on("data", (d) => logs.push(d.toString()));
  server.stderr.on("data", (d) => logs.push(d.toString()));

  const syncedGameId = `verify-mt3-${Date.now()}`;
  try {
    // wait for listen
    let up = false;
    for (let i = 0; i < 60; i += 1) {
      try {
        await fetch(`${BASE}/coach/login`, { redirect: "manual" });
        up = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!up) {
      check("app started on " + BASE, false, logs.join("").slice(-500));
      return;
    }
    check("app started on " + BASE, true);

    // ---- the gate still closes -----------------------------------------
    const noCookie = await fetch(`${BASE}/api/coach/games`, { redirect: "manual" });
    eq("no cookie -> 401 on /api/coach/games", noCookie.status, 401);

    const wrong = await fetch(`${BASE}/api/coach/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: "definitely-not-it" }),
    });
    eq("wrong passcode -> 401", wrong.status, 401);
    check("wrong passcode sets no cookie", cookieFrom(wrong, "ec_coach_session") === null);

    // =====================================================================
    // REGRESSION GATE — org-outlaws logs in and sees exactly what it saw
    // =====================================================================
    console.log("\n  -- org-outlaws regression --");
    const ownerLogin = await fetch(`${BASE}/api/coach/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: LOCAL_PASSCODE }),
    });
    eq("APP_PASSCODE login -> 200", ownerLogin.status, 200);
    const ownerCookie = cookieFrom(ownerLogin, "ec_coach_session");
    check("APP_PASSCODE login mints a signed session", Boolean(ownerCookie));

    const S = await import("../src/lib/coach/session.ts");
    const ownerPayload = await S.verifySession(ownerCookie, sessionSecret);
    eq("the session it mints is for org-outlaws", ownerPayload?.orgId, OWNER_ORG);
    eq("...with the owner role", ownerPayload?.role, "owner");

    const ownerGames = await (
      await fetch(`${BASE}/api/coach/games`, { headers: { cookie: `ec_coach_session=${ownerCookie}` } })
    ).json();
    check("org-outlaws' /api/coach/games responds ok", ownerGames.ok === true, JSON.stringify(ownerGames).slice(0, 200));
    eq(
      "org-outlaws sees EVERY one of its games and no more",
      ownerGames.games?.length,
      dbCounts.ow_games,
    );
    const ownerGameIds = new Set((ownerGames.games || []).map((g) => g.id));
    console.log(`        org-outlaws games returned: ${ownerGames.games?.length} (db says ${dbCounts.ow_games})`);

    // The MT-2 cookie Stuart's phone is carrying right now.
    const legacyValue = sha256Hex(`${AUTH_SALT}:${LOCAL_PASSCODE}`);
    const legacyRes = await fetch(`${BASE}/api/coach/games`, {
      headers: { cookie: `ec_coach_auth=${legacyValue}` },
    });
    const legacyBody = await legacyRes.json();
    eq("a pre-MT-3 ec_coach_auth cookie is still accepted", legacyRes.status, 200);
    eq("...and resolves to org-outlaws' data", legacyBody.games?.length, dbCounts.ow_games);
    const legacyForged = await fetch(`${BASE}/api/coach/games`, {
      headers: { cookie: `ec_coach_auth=${sha256Hex("nonsense")}` },
    });
    eq("a WRONG legacy cookie is still rejected", legacyForged.status, 401);

    // =====================================================================
    // ISOLATION — Talking Baseball
    // =====================================================================
    console.log("\n  -- Talking Baseball isolation --");
    const tbLogin = await fetch(`${BASE}/api/coach/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: demoPasscode }),
    });
    eq("Talking Baseball's provisioned passcode logs in -> 200", tbLogin.status, 200);
    const tbCookie = cookieFrom(tbLogin, "ec_coach_session");
    check("...and mints a signed session", Boolean(tbCookie));
    const tbPayload = await S.verifySession(tbCookie, sessionSecret);
    eq("the session names THEIR org, resolved from the passcode", tbPayload?.orgId, DEMO_ORG);

    const tbHeaders = { cookie: `ec_coach_session=${tbCookie}` };
    const tbGames = await (await fetch(`${BASE}/api/coach/games`, { headers: tbHeaders })).json();
    check("Talking Baseball's /api/coach/games responds ok", tbGames.ok === true);
    eq("Talking Baseball sees ZERO games", tbGames.games?.length, 0);
    const leaked = (tbGames.games || []).filter((g) => ownerGameIds.has(g.id));
    eq("no org-outlaws game id appears in their response", leaked.length, 0);

    // Every other read route, since a leak only needs one.
    const tbEvents = await (
      await fetch(`${BASE}/api/coach/play-events?id=${[...ownerGameIds][0] ?? "none"}`, { headers: tbHeaders })
    ).json();
    check(
      "asking for an org-outlaws game by id returns 'not found', not the game",
      tbEvents.ok === false,
      JSON.stringify(tbEvents).slice(0, 120),
    );
    const tbDirect = await fetch(`${BASE}/api/coach/game/${[...ownerGameIds][0] ?? "none"}`, {
      headers: tbHeaders,
    });
    eq("...and the single-game route agrees (404)", tbDirect.status, 404);
    const tbLineups = await (await fetch(`${BASE}/api/coach/lineup`, { headers: tbHeaders })).json();
    eq("Talking Baseball sees zero lineup plans", (tbLineups.plans || []).length, 0);

    // ---- game-sync end to end, into the DEMO tenant only ----------------
    // The one write in this harness. It proves the sync path still works under
    // the new session AND that it lands in the caller's org, not the owner's.
    const sync = await fetch(`${BASE}/api/coach/sync/game`, {
      method: "POST",
      headers: { ...tbHeaders, "content-type": "application/json" },
      body: JSON.stringify({
        game: {
          id: syncedGameId,
          label: "verify-mt3 probe",
          date: new Date().toISOString(),
          score: { us: 1, opponents: 0 },
          opponentTeamName: "Verify Probe FC",
          usAreHome: true,
          pins: [{ id: 1, x: 40, y: 30, result: "single", batter: "#1", battingTeam: "us", inning: 1 }],
        },
      }),
    });
    const syncBody = await sync.json();
    check("game-sync succeeds for the new tenant", sync.ok, JSON.stringify(syncBody).slice(0, 200));

    const [after] = await runSql(`
      select
        (select count(*)::int from public.games where org_id='${DEMO_ORG}')  as tb_games,
        (select count(*)::int from public.games where org_id='${OWNER_ORG}') as ow_games,
        (select org_id from public.games where client_game_id='${syncedGameId}') as landed_in;`);
    eq("the synced game landed in Talking Baseball's org", after.landed_in, DEMO_ORG);
    eq("Talking Baseball now has exactly one game", after.tb_games, 1);
    eq("org-outlaws' game count is UNCHANGED by their write", after.ow_games, dbCounts.ow_games);

    const ownerAfter = await (
      await fetch(`${BASE}/api/coach/games`, { headers: { cookie: `ec_coach_session=${ownerCookie}` } })
    ).json();
    eq("org-outlaws does not see the other tenant's new game", ownerAfter.games?.length, dbCounts.ow_games);

    // ---- forgery -------------------------------------------------------
    const forged = await S.signSession({ orgId: OWNER_ORG, role: "owner" }, "attacker-secret", 3600);
    const forgedRes = await fetch(`${BASE}/api/coach/games`, {
      headers: { cookie: `ec_coach_session=${forged}` },
    });
    eq("a session signed with the wrong key is refused", forgedRes.status, 401);

    const swappedOrg = (() => {
      const [p, s] = tbCookie.split(".");
      const obj = JSON.parse(Buffer.from(p, "base64url").toString());
      obj.orgId = OWNER_ORG;
      return `${Buffer.from(JSON.stringify(obj)).toString("base64url")}.${s}`;
    })();
    const swappedRes = await fetch(`${BASE}/api/coach/games`, {
      headers: { cookie: `ec_coach_session=${swappedOrg}` },
    });
    eq("rewriting orgId in a real cookie is refused", swappedRes.status, 401);

    // ---- logout --------------------------------------------------------
    const logout = await fetch(`${BASE}/api/coach/login`, { method: "DELETE" });
    eq("logout -> 200", logout.status, 200);
    eq("logout clears the signed cookie", cookieFrom(logout, "ec_coach_session"), "");
    eq("logout clears the legacy cookie too", cookieFrom(logout, "ec_coach_auth"), "");
  } finally {
    // Always: remove the probe game, and leave the demo tenant empty again.
    try {
      await runSql(`
        delete from public.play_events
        where org_id='${DEMO_ORG}'
          and game_id in (select id from public.games where org_id='${DEMO_ORG}' and client_game_id='${syncedGameId}');
        delete from public.games where org_id='${DEMO_ORG}' and client_game_id='${syncedGameId}';
        delete from public.teams where org_id='${DEMO_ORG}' and kind='opponent';
        select
          (select count(*)::int from public.games where org_id='${DEMO_ORG}')  as tb_games,
          (select count(*)::int from public.teams where org_id='${DEMO_ORG}')  as tb_teams,
          (select count(*)::int from public.games where org_id='${OWNER_ORG}') as ow_games;`).then((rows) => {
        const r = rows[0];
        eq("cleanup: demo tenant is empty again", r.tb_games, 0);
        eq("cleanup: demo tenant has only its own team", r.tb_teams, 1);
        check("cleanup: org-outlaws untouched throughout", r.ow_games > 0, `${r.ow_games} games`);
      });
    } catch (e) {
      check("cleanup ran", false, String(e).slice(0, 200));
    }
    // Layer 6 reuses this server rather than starting a second one; it is
    // stopped in stopServer() below, after the browser work is done.
  }

  return { server, sessionSecret, demoPasscode };
}

function stopServer(server) {
  if (!server) return;
  // Negative pid = the whole process group. `next start` runs as a grandchild
  // of npx; signalling only the child leaves it listening. See the preflight
  // note in layer5 for what that cost.
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

// ===========================================================================
// LAYER 6 — two tenants, one browser
// ===========================================================================
// The leak this closes cannot be seen from the database OR from a fake Storage,
// which is why it needs a real browser: a coach who uses one phone for two
// clubs, or Stuart demoing the product to Talking Baseball on his own device.
// Server-side scoping is irrelevant here — the collision would be entirely in
// localStorage, and every check in layers 1-5 would stay green through it.
//
// What must be true after switching tenants on one browser:
//   * the second tenant starts on a DEFAULT EMPTY game, not the first's;
//   * nothing of the first tenant's is on their screen;
//   * and the first tenant's state is still there, because logging out must
//     never delete an in-progress game (that is why logout clears cookies and
//     touches no storage).
const CHROME =
  process.env.CHROME_PATH || "/home/swall/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";

async function layer6({ demoPasscode }) {
  console.log("\nLAYER 6 — two tenants, one browser (T7 client-side isolation)");
  if (!fs.existsSync(CHROME)) {
    console.log(`  SKIP  no chromium at ${CHROME} — set CHROME_PATH to run this layer`);
    return;
  }
  const { chromium } = await import(
    "/home/swall/.local/lib/node_modules/openclaw/node_modules/playwright-core/index.mjs"
  );
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const page = await (await browser.newContext()).newPage();
    const login = async (passcode) => {
      await page.goto(`${BASE}/coach/login`, { waitUntil: "networkidle" });
      await page.fill('input[type="password"]', passcode);
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 15000 });
    };

    // The owner, with a game in progress that came from a pre-MT-3 blob.
    await login(LOCAL_PASSCODE);
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "outlaws-field-app:v1",
        JSON.stringify({
          inning: 5,
          ourRuns: 12,
          oppRuns: 1,
          outlawsLineup: ["#77", "#88"],
          opponentTeamName: "Secret Opponent",
          pins: [],
          eventsV2: [],
        }),
      );
    });
    await page.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const ownerBody = (await page.textContent("body")) || "";
    check(
      "owner's in-progress game is on screen before the switch",
      ownerBody.includes("#77") && ownerBody.includes("Secret Opponent"),
      `#77 ${ownerBody.includes("#77")}, opponent ${ownerBody.includes("Secret Opponent")}`,
    );

    // Log out, log in as the other tenant, same browser profile.
    await page.evaluate(() => fetch("/api/coach/login", { method: "DELETE" }));
    await login(demoPasscode);
    await page.goto(`${BASE}/coach`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);

    const tbBody = (await page.textContent("body")) || "";
    const after = await page.evaluate(() => ({
      keys: Object.keys(localStorage).sort(),
      tb: localStorage.getItem("coach:org-talking-baseball:state:v1"),
    }));
    const tbState = after.tb ? JSON.parse(after.tb) : null;

    check("the other tenant does NOT see the owner's batter on screen", !tbBody.includes("#77"));
    check(
      "the other tenant does NOT see the owner's opponent on screen",
      !tbBody.includes("Secret Opponent"),
    );
    eq("their own state starts at inning 1", tbState?.inning, 1);
    check(
      "...with a 0-0 score, not the owner's 12-1",
      tbState?.ourRuns === 0 && tbState?.oppRuns === 0,
      `${tbState?.ourRuns}-${tbState?.oppRuns}`,
    );
    check(
      "...and the owner's batting order is nowhere in their blob",
      !JSON.stringify(tbState ?? {}).includes("#77"),
    );
    check(
      "the owner's state SURVIVES the switch (logging out must not delete a game)",
      after.keys.includes("coach:org-outlaws:state:v1"),
      after.keys.join(", "),
    );
    check(
      "...and so does the pre-MT-3 backup blob",
      after.keys.includes("outlaws-field-app:v1"),
    );
  } finally {
    await browser.close();
  }
}

// ===========================================================================

console.log(`MT-3 verification — project ${PROJECT_REF}`);
await layer1();
await layer2();
await layer3();
const dbCounts = await layer4();
const running = await layer5(dbCounts);
try {
  if (running?.demoPasscode) await layer6(running);
} finally {
  stopServer(running?.server);
}

console.log("\n" + "═".repeat(72));
if (failures.length === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
  console.log(
    "\nScope of this result, stated so it is not over-read (§9.1, §9.2):\n" +
      "  * Tenant identity is real: the org id in the cookie is signed, and\n" +
      "    every way of rewriting it that was tried above is refused.\n" +
      "  * Isolation is enforced by the MT-2 Stage A chokepoint — the mandatory\n" +
      "    OrgScope on the four functions in src/lib/supabase.ts — proven above\n" +
      "    end to end, over HTTP, against the live database.\n" +
      "  * It is NOT enforced by Postgres. §3.4 Stage B needed a symmetric JWT\n" +
      "    secret to sign an org claim with; this project's active signing key\n" +
      "    is ES256 and the HS256 key is 'previously_used', so §9.1's written\n" +
      "    contingency applies and MT-3 ships with Stage A only. Migration\n" +
      "    013's policies remain correct-but-inert. Real DB enforcement lands\n" +
      "    with Supabase Auth in MT-5.\n" +
      "  * org_passcodes is the one exception: RLS on with zero policies means\n" +
      "    deny-all for anon, which bites today.",
  );
} else {
  console.log(`${failures.length} CHECK(S) FAILED, ${passed} passed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
