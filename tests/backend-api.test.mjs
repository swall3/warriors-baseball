// Isolated local integration only. Never point this harness at a deployment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { signSession } from "../src/lib/coach/session.ts";
const base = "http://127.0.0.1:4181";
const env = Object.fromEntries(
  (await readFile(new URL("../.env.local", import.meta.url), "utf8"))
    .trim()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).trim()];
    }),
);
assert.equal(
  env.SUPABASE_URL,
  "http://127.0.0.1:54390",
  "Only the disposable local review database is allowed",
);
const cookie = async (orgId, role) =>
  `ec_coach_session=${await signSession({ orgId, role }, env.SESSION_SECRET, 3600)}`;
const coach = await cookie("org-outlaws", "owner");
const viewer = await cookie("org-outlaws", "viewer");
const other = await cookie("org-review-talking", "coach");
async function request(
  path,
  { method = "GET", body, auth = coach, token, origin = base } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      cookie: auth,
      origin,
      "content-type": "application/json",
      ...(token ? { "x-recording-token": token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ...(await response.json()) };
}
const prefix = "/api/coach";

async function routes(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      found.push(
        ...(await routes(
          new URL(entry.name + "/", dir),
          prefix + "/" + entry.name,
        )),
      );
    else if (entry.name === "route.ts") {
      const code = await readFile(new URL(entry.name, dir), "utf8");
      const methods = [
        ...code.matchAll(
          /export (?:async function|const) (GET|POST|PATCH|DELETE)\b/g,
        ),
      ].map((m) => m[1]);
      found.push({
        path: prefix.replace(/\[[^\]]+\]/g, "audit-missing"),
        methods,
      });
    }
  }
  return found;
}
test("every protected route and method denies absent, forged and expired sessions", async () => {
  const expired = `ec_coach_session=${await signSession({ orgId: "org-outlaws", role: "owner" }, env.SESSION_SECRET, -1)}`;
  const all = await routes(new URL("../src/app/api/coach/", import.meta.url));
  for (const route of all) {
    if (route.path === "/login") continue;
    assert.ok(route.methods.length, route.path);
    for (const method of route.methods)
      for (const auth of ["", "ec_coach_session=forged", expired]) {
        const result = await request(prefix + route.path, {
          method,
          auth,
          ...(method !== "GET" ? { body: {} } : {}),
        });
        assert.equal(result.status, 401, `${method} ${route.path}`);
      }
  }
});
test("legacy writes deny viewers, cross-origin and malformed input", async () => {
  for (const path of ["/lineup", "/sync/game"]) {
    assert.equal(
      (await request(prefix + path, { method: "POST", auth: viewer, body: {} }))
        .status,
      403,
    );
    assert.equal(
      (
        await request(prefix + path, {
          method: "POST",
          origin: "https://untrusted.example",
          body: {},
        })
      ).status,
      403,
    );
    assert.equal(
      (await request(prefix + path, { method: "POST", body: {} })).status,
      400,
    );
  }
});
test("historical sync is replayable, validates input, and unifies with shared games", async () => {
  const id = "audit-" + randomUUID();
  const pin = {
    id: 1,
    inning: 1,
    batter: "Audit Player",
    battingTeam: "us",
    result: "single",
    zone: "left_field",
    x: 30,
    y: 40,
  };
  const game = {
    id,
    label: "Backend audit fixture",
    date: "2026-09-22",
    opponentTeamName: "Audit Visitors",
    score: { us: 1, opponents: 0 },
    pins: [pin],
  };
  const save = () =>
    request(prefix + "/sync/game", { method: "POST", body: { game } });
  assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 200);
  let rows = await request(prefix + "/play-events?id=" + id + "&team=all");
  assert.equal(rows.events.length, 1);
  const malformed = structuredClone(game);
  malformed.pins[0].x = 101;
  assert.equal(
    (
      await request(prefix + "/sync/game", {
        method: "POST",
        body: { game: malformed },
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(prefix + "/play-events?id=" + id + "&team=all")).events
      .length,
    1,
  );
  assert.equal(
    (await request(prefix + "/game/" + id, { auth: other })).status,
    404,
  );
  const plan = {
    id: "plan-" + randomUUID(),
    teamId: "team-review-warriors",
    gameId: id,
    label: "Audit plan",
    format: "kid_pitch",
    battingOrder: [],
    groups: {},
    inningMap: {},
  };
  assert.equal(
    (await request(prefix + "/lineup", { method: "POST", body: { plan } }))
      .status,
    200,
  );
  assert.equal(
    (await request(prefix + "/lineup?id=" + plan.id)).plan.gameId,
    id,
  );
  assert.equal(
    (await request(prefix + "/lineup?id=" + plan.id, { auth: other })).plan,
    null,
  );
  assert.equal(
    (
      await request(prefix + "/lineup", {
        method: "POST",
        auth: other,
        body: { plan },
      })
    ).status,
    404,
  );
  const catalog = await request(prefix + "/catalog");
  assert.ok(!catalog.teams.some((t) => t.name === "Audit Visitors"));
  const reports = await request(prefix + "/reports");
  assert.equal(reports.status, 200);
  assert.equal(reports.games.filter((g) => g.sourceId === id).length, 1);
  assert.ok(reports.games.some((g) => g.source === "shared"));
  assert.ok(
    !(await request(prefix + "/reports", { auth: other })).games.some(
      (g) => g.sourceId === id,
    ),
  );
});
test("atomic import failure rolls back metadata and events; failed event insertion retains the original game", async () => {
  const rpc = async (body, key) =>
    fetch(env.SUPABASE_URL + "/rest/v1/rpc/sync_historical_game", {
      method: "POST",
      headers: {
        apikey: key,
        authorization: "Bearer " + key,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const id = "rollback-" + randomUUID();
  const game = {
    id,
    label: "Original",
    date: "2026-09-22",
    opponentTeamName: "Rollback Visitors",
    score: { us: 0, opponents: 0 },
    pins: [
      {
        id: 1,
        batter: "Player",
        inning: 1,
        battingTeam: "us",
        result: "single",
        zone: "left_field",
        x: 30,
        y: 40,
      },
    ],
  };
  assert.equal(
    (await request(prefix + "/sync/game", { method: "POST", body: { game } }))
      .status,
    200,
  );
  const body = {
    p_org: "org-outlaws",
    p_game: {
      client_game_id: id,
      label: "Must roll back",
      played_at: "2026-09-22",
      opponent_name: "Rollback Visitors",
      us_score: 8,
      opponent_score: 0,
      schema_version: 2,
      us_home: false,
    },
    p_events: [{ inning: "not an integer" }],
  };
  const result = await rpc(body, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(!result.ok);
  const saved = (await request(prefix + "/game/" + id)).game;
  assert.equal(saved.label, "Original");
  assert.equal(saved.eventsV2.length, 1);
  assert.equal(saved.score.us, 0);
});
test("login rejects bad input; signup rejects malformed or oversized fields", async () => {
  const login = await fetch(base + prefix + "/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode: env.APP_PASSCODE }),
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /ec_coach_session=/);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/i);
  assert.equal(
    (
      await request(prefix + "/login", {
        method: "POST",
        auth: "",
        body: { passcode: "" },
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(prefix + "/login", {
        method: "POST",
        auth: "",
        body: { passcode: "x".repeat(257) },
      })
    ).status,
    401,
  );
  for (const body of [
    {},
    {
      playerName: {},
      age: "8",
      parentName: "Parent",
      phone: "123",
      email: "test@example.com",
    },
    {
      playerName: "Player",
      age: "8x",
      parentName: "Parent",
      phone: "123",
      email: "test@example.com",
    },
  ])
    assert.equal(
      (await request("/api/signup", { method: "POST", auth: "", body })).status,
      400,
    );
  const bad = await fetch(base + prefix + "/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(bad.status, 400);
});

test("valid public signup saves in the disposable database",async()=>{
 const result=await request("/api/signup",{method:"POST",auth:"",body:{playerName:"Synthetic audit player",age:"8",parentName:"Synthetic audit parent",phone:"555-0100",email:"audit@example.test",notes:"Disposable backend verification"}});
 assert.equal(result.status,200);assert.equal(result.success,true);
});
