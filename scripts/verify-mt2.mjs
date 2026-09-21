#!/usr/bin/env node
// MT-2 verification harness — MULTI-TENANT-PLAN.md §6.3 and MT-2 step 7 (M9).
//
//   node scripts/verify-mt2.mjs
//
// §8 calls M9 "the only artifact that proves the plan worked" and marks it
// DO NOT SKIP. This is it. It checks three things that fail in three different
// places, so it is built in three layers:
//
//   LAYER 1 — WIRE. Does every query the app emits actually carry the org
//     predicate? Compiles src/lib/supabase.ts, points it at a local HTTP
//     server standing in for PostgREST, and inspects the requests
//     @supabase/supabase-js puts on the wire. The stub answers every request
//     with BOTH orgs' rows on purpose: if it filtered, the test would be
//     grading its own mock. The assertion is on the outbound URL and body.
//
//   LAYER 2 — DATABASE, STRUCTURE. §6.3 Blocks B and C against the live
//     project: the backfill landed, org_id is NOT NULL everywhere, and every
//     cross-tenant FK is two-column and leads with org_id.
//
//   LAYER 3 — DATABASE, ISOLATION. Creates a real org-test tenant with rows
//     that collide with org-outlaws' on every formerly-global unique, proves
//     the scoped queries do not see them and the composite FKs refuse to link
//     them, then deletes it. Plus both directions of 013's public_signup_insert
//     policy, executed as a role RLS applies to.
//
// ⚠️ WHY LAYER 3 DOES NOT DRIVE A BROWSER, unlike scripts/verify-mt1.mjs.
// MT-1's risks were client-side, so a browser was the only instrument that
// could see them. MT-2's are not, and here a browser would actively mislead:
// this worktree's .env.local holds only SUPABASE_MGMT_TOKEN — no SUPABASE_URL,
// no service-role key — so isSupabaseEnabled() is false, readDb() falls
// through to seed-db.json, and /coach/games would return no org-test row no
// matter how badly the scoping were broken. It would be a green check that
// tests nothing. Layer 1 asks the question a browser cannot ("is the predicate
// on the wire?") and layer 3 asks the one it would fake ("does the database
// withhold the row?").
//
// ⚠️ AND WHY THE ISOLATION CHECKS RUN AS `anon`/`authenticated` VIA SET LOCAL
// ROLE. The Management API connects as `postgres`, which carries BYPASSRLS
// (confirmed against pg_roles, not assumed). Every statement it sends sees
// every row of every tenant, and `force row level security` does not change
// that — FORCE removes the table-OWNER exemption, not the role-attribute one.
// A policy check run as postgres passes unconditionally and means nothing.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { runSql, trySql, ROOT, PROJECT_REF } from "./lib/sql.mjs";

const TEST_ORG = "org-test";
const OWNER_ORG = "org-outlaws";

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
  check(label, actual === expected, `got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}

// ===========================================================================
// LAYER 1 — the wire
// ===========================================================================
async function layer1() {
  console.log("\nLAYER 1 — every query on the wire carries the org scope");
  console.log("─".repeat(72));

  const outDir = fs.mkdtempSync(path.join(ROOT, ".verify-mt2-"));
  const captured = [];
  let server;

  try {
    // Compile the shim alone. It imports nothing from the app (no "@/" paths),
    // so it compiles standalone — which is why it can be exercised outside
    // Next's module graph at all.
    const tsc = spawnSync(
      "npx",
      ["tsc", "src/lib/supabase.ts", "--outDir", outDir, "--module", "commonjs",
       "--target", "es2022", "--moduleResolution", "node", "--skipLibCheck", "--esModuleInterop"],
      { cwd: ROOT, stdio: "inherit" },
    );
    if (tsc.status !== 0) throw new Error("tsc failed to compile src/lib/supabase.ts");

    // A stand-in PostgREST that records what it was asked and answers with
    // BOTH tenants' rows regardless. If it honoured the filter, layer 1 would
    // be testing this mock rather than the shim.
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        captured.push({ method: req.method, url: req.url, body });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([
          { id: "row-owner", org_id: OWNER_ORG },
          { id: "row-other", org_id: TEST_ORG },
        ]));
      });
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const url = `http://127.0.0.1:${server.address().port}`;

    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-not-a-real-key";

    const require = createRequire(import.meta.url);
    const sb = require(path.join(outDir, "supabase.js"));
    const scope = { orgId: OWNER_ORG };

    // --- reads ---
    await sb.sbSelectAll(scope, "teams");
    check(
      "sbSelectAll appends org_id=eq.<orgId>",
      captured.at(-1).url.includes(`org_id=eq.${OWNER_ORG}`),
      captured.at(-1).url,
    );

    await sb.sbSelectAll(scope, "games", "select=*&order=played_at.desc");
    check(
      "sbSelectAll keeps the caller's own filters AND adds the scope",
      captured.at(-1).url.includes(`org_id=eq.${OWNER_ORG}`) &&
        captured.at(-1).url.includes("order=played_at.desc"),
      captured.at(-1).url,
    );

    // --- writes are stamped, not merely filtered ---
    await sb.sbInsert(scope, "play_events", [{ id: "e1" }, { id: "e2" }]);
    const inserted = JSON.parse(captured.at(-1).body);
    check(
      "sbInsert stamps org_id on every row",
      inserted.length === 2 && inserted.every((r) => r.org_id === OWNER_ORG),
      captured.at(-1).body,
    );

    // The property that makes the stamp a boundary rather than a default: a
    // caller cannot write into another tenant even by asking explicitly,
    // because the stamp is applied last.
    await sb.sbInsert(scope, "play_events", [{ id: "e3", org_id: TEST_ORG }]);
    eq(
      "sbInsert OVERRIDES a caller-supplied foreign org_id",
      JSON.parse(captured.at(-1).body)[0].org_id,
      OWNER_ORG,
    );

    await sb.sbUpsert(scope, "games", [{ id: "g1", org_id: TEST_ORG }], "org_id,client_game_id");
    eq(
      "sbUpsert overrides a caller-supplied foreign org_id",
      JSON.parse(captured.at(-1).body)[0].org_id,
      OWNER_ORG,
    );
    check(
      "sbUpsert targets the org-scoped unique (migration 011)",
      captured.at(-1).url.includes("on_conflict=org_id%2Cclient_game_id") ||
        captured.at(-1).url.includes("on_conflict=org_id,client_game_id"),
      captured.at(-1).url,
    );

    await sb.sbDelete(scope, "play_events", "game_id=eq.game-1");
    check(
      "sbDelete is org-scoped as well as filtered",
      captured.at(-1).url.includes(`org_id=eq.${OWNER_ORG}`) &&
        captured.at(-1).url.includes("game_id=eq.game-1"),
      captured.at(-1).url,
    );

    // --- every REAL call site names an org-scoped conflict target ---
    //
    // ⚠️ THIS CHECK EXISTS BECAUSE ITS ABSENCE HID A BUG. The sbUpsert
    // assertion above passes because this file hands it "org_id,
    // client_game_id" — it grades the shim, not the application, and it stayed
    // green while api/coach/lineup/route.ts was still upserting lineup_plans on
    // a bare "id". That was the one MT-2 path where a request body could reach
    // across tenants: ON CONFLICT resolves inside Postgres, so the org filter
    // cannot touch it, and a client-supplied plan.id matching another org's row
    // would have UPDATEd that row and re-tenanted it.
    //
    // So this reads the conflict target out of the SOURCE instead of accepting
    // one as a parameter. Any new sbUpsert on a tenant table has to name a
    // unique whose leading column is org_id, or the harness fails.
    const upsertSites = [];
    const srcFiles = spawnSync("grep", ["-rl", "sbUpsert(", "src/"], { cwd: ROOT, encoding: "utf8" })
      .stdout.split("\n").filter(Boolean).filter((f) => !f.endsWith("src/lib/supabase.ts"));
    for (const file of srcFiles) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (let i = text.indexOf("sbUpsert("); i !== -1; i = text.indexOf("sbUpsert(", i + 1)) {
        // Walk to the matching close paren so multi-line calls are handled.
        let depth = 0, end = i;
        for (let j = text.indexOf("(", i); j < text.length; j += 1) {
          if (text[j] === "(") depth += 1;
          else if (text[j] === ")") { depth -= 1; if (depth === 0) { end = j; break; } }
        }
        const call = text.slice(i, end);
        // The onConflict argument is the last string literal in the call.
        const literals = call.match(/"[^"]*"/g) || [];
        upsertSites.push({ file, onConflict: literals.at(-1) });
      }
    }
    check("found every sbUpsert call site in src/", upsertSites.length === 3,
      `${upsertSites.length} sites: ${upsertSites.map((u) => u.onConflict).join(" ")}`);
    for (const site of upsertSites) {
      check(
        `${site.file} upserts on an org-scoped conflict target`,
        /^"org_id[,"]/.test(site.onConflict || ""),
        `onConflict = ${site.onConflict}`,
      );
    }

    // --- a missing scope must throw, never default (T6) ---
    for (const [label, fn] of [
      ["sbSelectAll", () => sb.sbSelectAll(undefined, "teams")],
      ["sbInsert", () => sb.sbInsert({ orgId: "" }, "teams", [{ id: "x" }])],
      ["sbUpsert", () => sb.sbUpsert({}, "teams", [{ id: "x" }], "id")],
      ["sbDelete", () => sb.sbDelete(null, "teams", "id=eq.x")],
    ]) {
      let threw = false;
      try {
        await fn();
      } catch {
        threw = true;
      }
      check(`${label} throws on a missing scope rather than defaulting (T6)`, threw);
    }
  } finally {
    if (server) await new Promise((r) => server.close(r));
    fs.rmSync(outDir, { recursive: true, force: true });
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
}

// ===========================================================================
// LAYER 2 — §6.3 Blocks B and C
// ===========================================================================
async function layer2() {
  console.log("\nLAYER 2 — §6.3 Block B: the backfill landed and org_id is mandatory");
  console.log("─".repeat(72));

  const counts = await runSql(`
    select 'organizations' k, count(*)::int n from public.organizations
    union all select 'org_members', count(*)::int from public.org_members
    union all select 'teams.null', count(*)::int from public.teams where org_id is null
    union all select 'games.null', count(*)::int from public.games where org_id is null
    union all select 'play_events.null', count(*)::int from public.play_events where org_id is null
    union all select 'players.null', count(*)::int from public.players where org_id is null
    union all select 'player_aliases.null', count(*)::int from public.player_aliases where org_id is null
    union all select 'lineup_plans.null', count(*)::int from public.lineup_plans where org_id is null
    union all select 'tryout_signups.null', count(*)::int from public.tryout_signups where org_id is null;`);
  const by = Object.fromEntries(counts.map((r) => [r.k, r.n]));

  eq("organizations = 1", by["organizations"], 1);
  eq("org_members = 0 (empty by design until MT-5, §2.2)", by["org_members"], 0);
  for (const t of ["teams", "games", "play_events", "players", "player_aliases", "lineup_plans", "tryout_signups"]) {
    eq(`${t}: zero rows with a null org_id`, by[`${t}.null`], 0);
  }

  const nullable = await runSql(`
    select table_name, is_nullable from information_schema.columns
     where table_schema='public' and column_name='org_id'
       and table_name <> 'org_members' order by table_name;`);
  eq(
    "org_id is NOT NULL on all 7 tenant tables",
    nullable.filter((r) => r.is_nullable === "NO").length,
    7,
  );

  const kinds = await runSql(`select kind, count(*)::int n from public.teams group by 1 order by 1`);
  check(
    "teams.kind separates our team from scouted opponents",
    JSON.stringify(kinds) === JSON.stringify([{ kind: "opponent", n: 2 }, { kind: "own", n: 1 }]),
    JSON.stringify(kinds),
  );

  console.log("\nLAYER 2 — §6.3 Block C: composite FKs replaced the originals");
  console.log("─".repeat(72));

  const fks = await runSql(`
    select conrelid::regclass::text tbl, conname, pg_get_constraintdef(oid) def
      from pg_constraint where contype='f'
       and confrelid <> 'public.organizations'::regclass
       and conrelid in ('public.play_events'::regclass,'public.games'::regclass,
                        'public.players'::regclass,'public.player_aliases'::regclass,
                        'public.lineup_plans'::regclass)
     order by 1,2;`);

  // The point of Block C: `drop constraint if exists` on a wrong name is a
  // silent no-op, so a surviving single-column FK would mean the migration
  // "succeeded" while leaving the hole open.
  eq("exactly 7 cross-tenant foreign keys", fks.length, 7);
  for (const fk of fks) {
    check(
      `${fk.tbl}.${fk.conname} is two-column and leads with org_id`,
      /FOREIGN KEY \(org_id, /.test(fk.def),
      fk.def,
    );
  }

  const uniques = await runSql(`
    select conname, pg_get_constraintdef(oid) def from pg_constraint
     where conrelid in ('public.teams'::regclass,'public.games'::regclass,'public.player_aliases'::regclass)
       and contype in ('u','p') order by conname;`);
  const names = uniques.map((u) => u.conname);
  check("T1 fixed: teams unique is (org_id, normalized_name)",
    names.includes("teams_org_normalized_name_key") && !names.includes("teams_normalized_name_key"));
  check("T4 fixed: player_aliases PK is (org_id, alias)",
    uniques.some((u) => u.conname === "player_aliases_pkey" && u.def.includes("(org_id, alias)")));
  check("games.client_game_id unique is org-scoped (011 §3)",
    names.includes("games_org_client_game_id_key") && !names.includes("games_client_game_id_key"));
}

// ===========================================================================
// LAYER 3 — real isolation against a real second tenant
// ===========================================================================
async function layer3() {
  console.log("\nLAYER 3 — a real org-test tenant, then negative isolation");
  console.log("─".repeat(72));

  // Seed a tenant designed to collide with org-outlaws on EVERY constraint
  // that used to be global. Before 011 not one of these inserts would have
  // been possible; that they are is itself the T1/T4 fix demonstrated on live
  // data rather than read out of a catalog.
  await runSql(`
    insert into public.organizations (id, slug, name, short_name)
    values ('${TEST_ORG}', 'mt2-verify', 'MT-2 Verification Org', 'Test')
    on conflict (id) do nothing;

    insert into public.teams (id, name, normalized_name, kind, org_id, created_at)
    values ('team-mt2-verify-own', 'Verify Own', 'outlaws',   'own',      '${TEST_ORG}', now()),
           ('team-mt2-verify-opp', 'NYO Bucks',  'nyo bucks', 'opponent', '${TEST_ORG}', now())
    on conflict do nothing;

    insert into public.games (id, client_game_id, label, played_at, opponent_team_id,
                              us_score, opponent_score, source, schema_version, us_home,
                              org_id, created_at, updated_at)
    values ('game-mt2-verify', 'game-2026-05-24-bucks', 'VERIFY — must never appear in org-outlaws',
            now(), 'team-mt2-verify-opp', 99, 98, 'local_storage', 2, false,
            '${TEST_ORG}', now(), now())
    on conflict do nothing;

    insert into public.players (id, team_id, display_name, org_id)
    values ('plr-mt2-verify', 'team-mt2-verify-own', 'Not Our Jack', '${TEST_ORG}')
    on conflict do nothing;

    insert into public.player_aliases (alias, player_id, org_id)
    values ('jack', 'plr-mt2-verify', '${TEST_ORG}')
    on conflict do nothing;

    select 1;`);

  try {
    // --- The collisions themselves are the T1/T4 proof --------------------
    const collide = await runSql(`
      select 'teams normalized_name' k, count(*)::int n from public.teams where normalized_name='nyo bucks'
      union all select 'games client_game_id', count(*)::int from public.games where client_game_id='game-2026-05-24-bucks'
      union all select 'player_aliases jack', count(*)::int from public.player_aliases where alias='jack';`);
    const c = Object.fromEntries(collide.map((r) => [r.k, r.n]));
    eq("T1: two orgs can both scout a team named 'nyo bucks'", c["teams normalized_name"], 2);
    eq("011 §3: two orgs can hold the same client_game_id", c["games client_game_id"], 2);
    eq("T4: two orgs can both have a player aliased 'jack'", c["player_aliases jack"], 2);

    // --- Negative isolation: the exact queries the app emits --------------
    // These are the predicates src/lib/coach/local-db.ts:readDbFromSupabase
    // now sends, spelled out in SQL. org-test's rows exist and are adjacent;
    // the scoped read must not see one of them.
    const scoped = await runSql(`
      select 'teams' k, count(*)::int n from public.teams where org_id='${OWNER_ORG}'
      union all select 'games', count(*)::int from public.games where org_id='${OWNER_ORG}'
      union all select 'play_events', count(*)::int from public.play_events where org_id='${OWNER_ORG}'
      union all select 'players', count(*)::int from public.players where org_id='${OWNER_ORG}'
      union all select 'aliases', count(*)::int from public.player_aliases where org_id='${OWNER_ORG}';`);
    const s = Object.fromEntries(scoped.map((r) => [r.k, r.n]));
    eq("scoped read of teams excludes org-test's 2 rows", s["teams"], 3);
    eq("scoped read of games excludes org-test's game", s["games"], 2);
    eq("scoped read of players excludes org-test's player", s["players"], 11);
    eq("scoped read of player_aliases excludes org-test's alias", s["aliases"], 14);
    eq("play_events still 119", s["play_events"], 119);

    // The check above is only meaningful if the rows it excludes really exist.
    // An unscoped read is what makes the exclusion mean something rather than
    // being indistinguishable from an empty table — the same trap §6.3 Block A
    // warns about.
    const unscoped = await runSql(`select count(*)::int n from public.teams`);
    eq("...and an UNSCOPED read does see them (so the check is not vacuous)", unscoped[0].n, 5);

    const leak = await runSql(`
      select count(*)::int n from public.games
       where org_id='${OWNER_ORG}' and label like 'VERIFY%';`);
    eq("the org-test game never appears under the owner org", leak[0].n, 0);

    // --- Structural isolation: the composite FKs refuse a cross link ------
    // This is what 012 bought. It holds against service_role too, because a
    // foreign key is not a policy.
    const crossGame = await trySql(`
      insert into public.games (id, client_game_id, label, played_at, opponent_team_id,
                                us_score, opponent_score, source, schema_version, us_home,
                                org_id, created_at, updated_at)
      values ('game-mt2-cross','game-mt2-cross','cross-tenant',now(),'team-nyo-bucks',
              0,0,'local_storage',2,false,'${TEST_ORG}',now(),now());`);
    check(
      "012: org-test cannot attach a game to org-outlaws' team",
      !crossGame.ok && /foreign key|violates/i.test(crossGame.error || ""),
      crossGame.ok ? "INSERT SUCCEEDED — cross-tenant link allowed" : "rejected by games_org_opponent_fk",
    );

    const crossEvent = await trySql(`
      insert into public.play_events (id, game_id, event_index, client_pin_id, inning, batter,
                                      batting_team, result, zone, x, y, event_type, description,
                                      outs_after, us_runs_after, opponent_runs_after, bases_after,
                                      org_id, created_at)
      values ('evt-mt2-cross','game-2026-05-24-bucks',0,'pin-x',1,'#1','us','single','left_field',
              50,50,'ball_in_play','x',0,0,0,'{}'::jsonb,'${TEST_ORG}',now());`);
    check(
      "012: org-test cannot attach a play event to org-outlaws' game",
      !crossEvent.ok && /foreign key|violates/i.test(crossEvent.error || ""),
      crossEvent.ok ? "INSERT SUCCEEDED — cross-tenant link allowed" : "rejected by play_events_org_game_fk",
    );

    // --- 014: an upsert cannot steal another org's lineup plan -----------
    // The concrete attack the global lineup_plans_pkey allowed: plan.id comes
    // from the request body, so org B could name org A's plan id and have ON
    // CONFLICT overwrite that row — flipping its org_id on the way past. This
    // replays it as SQL, with the same conflict target the route now uses.
    await runSql(`
      insert into public.lineup_plans (id, game_id, team_id, label, format,
                                       batting_order, groups, inning_map, org_id, updated_at)
      values ('plan-mt2-shared', null, 'team-outlaws', 'OWNER PLAN', 'coach_pitch',
              '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '${OWNER_ORG}', now());

      insert into public.lineup_plans (id, game_id, team_id, label, format,
                                       batting_order, groups, inning_map, org_id, updated_at)
      values ('plan-mt2-shared', null, 'team-mt2-verify-own', 'ATTACKER PLAN', 'coach_pitch',
              '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, '${TEST_ORG}', now())
      on conflict (org_id, id) do update set label = excluded.label;

      select 1;`);

    const plans = await runSql(`
      select org_id, label from public.lineup_plans where id='plan-mt2-shared' order by org_id`);
    eq("014: the same plan id in two orgs yields two rows, not one", plans.length, 2);
    check(
      "014: org-outlaws' plan is untouched by org-test's upsert",
      plans.some((p) => p.org_id === OWNER_ORG && p.label === "OWNER PLAN"),
      JSON.stringify(plans),
    );
    await runSql(`delete from public.lineup_plans where id='plan-mt2-shared'; select 1;`);

    // --- 013's policies, executed as a role RLS actually applies to -------
    console.log("\nLAYER 3 — RLS policies, run as anon/authenticated (not as postgres)");
    console.log("─".repeat(72));

    const anonSees = await runSql(
      `begin; set local role anon; select count(*)::int n from public.teams; rollback;`);
    eq("anon sees no teams (no policy grants it any)", anonSees[0].n, 0);

    const anonSignups = await trySql(
      `begin; set local role anon; select count(*)::int n from public.tryout_signups; rollback;`);
    check(
      "anon cannot READ tryout_signups — the insert policy grants insert only",
      !anonSignups.ok || anonSignups.rows[0].n === 0,
      anonSignups.ok ? `returned ${anonSignups.rows[0].n} rows` : "refused",
    );

    // BOTH DIRECTIONS. A deny alone is consistent with a policy that denies
    // everything, which would be a broken public form rather than a secure
    // one — so the honest insert has to be shown to succeed.
    const signupOk = await trySql(`
      begin;
      set local role anon;
      insert into public.tryout_signups
        (player_name, age, parent_name, phone, email, signed_up_at, org_id)
      values ('MT2 Verify','9','MT2 Parent','555-0100','mt2@example.test',now(),'${OWNER_ORG}');
      select count(*)::int n from public.tryout_signups;
      rollback;`);
    check(
      "POSITIVE: anon MAY insert a signup stamped org-outlaws",
      signupOk.ok,
      signupOk.ok ? "accepted by public_signup_insert" : signupOk.error,
    );

    const signupTampered = await trySql(`
      begin;
      set local role anon;
      insert into public.tryout_signups
        (player_name, age, parent_name, phone, email, signed_up_at, org_id)
      values ('MT2 Tampered','9','MT2 Parent','555-0100','mt2@example.test',now(),'${TEST_ORG}');
      rollback;`);
    check(
      "NEGATIVE: anon MAY NOT insert a signup with org_id tampered to org-test",
      !signupTampered.ok && /row-level security/i.test(signupTampered.error || ""),
      signupTampered.ok
        ? "INSERT SUCCEEDED — the policy is not enforcing"
        : "rejected by RLS policy public_signup_insert",
    );

    // --- current_org_ids(), the MT-3 path, proven correct a phase early ---
    // Inert today (no request path presents a JWT), but this is exactly the
    // claim §9.2 says must not be taken on faith from the policies' existence.
    const jwtOwner = await runSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"role":"authenticated","org_id":"${OWNER_ORG}"}';
      select count(*)::int n from public.teams;
      rollback;`);
    eq("with a JWT org_id claim of org-outlaws, tenant_isolation shows 3 teams", jwtOwner[0].n, 3);

    const jwtTest = await runSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"role":"authenticated","org_id":"${TEST_ORG}"}';
      select count(*)::int n from public.teams;
      rollback;`);
    eq("with a JWT org_id claim of org-test, it shows only org-test's 2 teams", jwtTest[0].n, 2);

    const jwtNone = await runSql(`
      begin;
      set local role authenticated;
      set local request.jwt.claims = '{"role":"authenticated"}';
      select count(*)::int n from public.teams;
      rollback;`);
    eq("with NO org_id claim it fails closed and shows nothing", jwtNone[0].n, 0);
  } finally {
    // Always runs. The org_id FKs are ON DELETE CASCADE, so removing the org
    // row removes every row seeded above.
    await runSql(`delete from public.organizations where id = '${TEST_ORG}'; select 1;`);
  }

  const leftovers = await runSql(`
    select 'organizations' k, count(*)::int n from public.organizations where id='${TEST_ORG}'
    union all select 'teams', count(*)::int from public.teams where org_id='${TEST_ORG}'
    union all select 'games', count(*)::int from public.games where org_id='${TEST_ORG}'
    union all select 'players', count(*)::int from public.players where org_id='${TEST_ORG}'
    union all select 'player_aliases', count(*)::int from public.player_aliases where org_id='${TEST_ORG}'
    union all select 'tryout_signups', count(*)::int from public.tryout_signups where org_id='${TEST_ORG}';`);
  eq("cleanup: no org-test rows survive anywhere",
    leftovers.reduce((sum, r) => sum + r.n, 0), 0);

  const owner = await runSql(`
    select (select count(*)::int from public.teams)       teams,
           (select count(*)::int from public.games)       games,
           (select count(*)::int from public.play_events) events,
           (select count(*)::int from public.players)     players,
           (select count(*)::int from public.player_aliases) aliases,
           (select count(*)::int from public.tryout_signups) signups;`);
  const o = owner[0];
  check(
    "org-outlaws' data is untouched by the whole run",
    o.teams === 3 && o.games === 2 && o.events === 119 && o.players === 11 &&
      o.aliases === 14 && o.signups === 0,
    JSON.stringify(o),
  );
}

// ===========================================================================

console.log(`MT-2 verification — project ${PROJECT_REF}`);
await layer1();
await layer2();
await layer3();

console.log("\n" + "═".repeat(72));
if (failures.length === 0) {
  console.log(`ALL ${passed} CHECKS PASSED`);
  console.log(
    "\nScope of this result, stated so it is not over-read (§9.2):\n" +
    "  * Every query and write the app emits carries the tenant predicate.\n" +
    "  * 011's uniques and 012's composite FKs isolate tenants against EVERY\n" +
    "    role, service_role included. These are real today.\n" +
    "  * 013's tenant_isolation policies are correctly written — proven above\n" +
    "    by presenting a JWT claim — but are INERT for the /coach request\n" +
    "    path, which still uses a BYPASSRLS service-role key (T2). MT-3 §3.4\n" +
    "    Stage B is what switches them on.\n" +
    "  * public_signup_insert is proven correct in both directions. Whether\n" +
    "    it PROTECTS production depends on SUPABASE_ANON_KEY being set in the\n" +
    "    deployment environment; until then api/signup falls back to the\n" +
    "    service-role key and bypasses it.",
  );
} else {
  console.log(`${failures.length} CHECK(S) FAILED, ${passed} passed:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
}
