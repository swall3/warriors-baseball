// Isolated local integration only. Never point this harness at a deployment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
test("roster management enforces role, organization and origin and preserves identity", async () => {
  const teamId = "team-review-warriors";
  const path = prefix + "/roster";
  const edit = { kind: "team", teamId, name: "Review Warriors" };
  assert.equal(
    (await request(path, { method: "PATCH", body: edit, auth: viewer })).status,
    403,
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: edit, auth: other })).status,
    404,
  );
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        body: edit,
        origin: "https://elsewhere.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: { ...edit, name: " " } }))
      .status,
    400,
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: edit })).status,
    200,
  );
  assert.equal(
    (await request(prefix + "/catalog")).teams.find((t) => t.id === teamId)
      .name,
    "Review Warriors",
  );
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        body: { ...edit, name: "Warriors" },
      })
    ).status,
    200,
  );
  const name = "Roster test " + randomUUID().slice(0, 8);
  assert.equal(
    (
      await request(path, {
        method: "POST",
        body: { kind: "player", teamId, name, jersey: "" },
      })
    ).status,
    201,
  );
  let rows = await request(path + "?teamId=" + teamId);
  const player = rows.players.find((p) => p.display_name === name);
  assert.ok(player.id);
  const update = {
    kind: "player",
    teamId,
    playerId: player.id,
    name: name + " edited",
    jersey: "",
    active: false,
  };
  assert.equal(
    (await request(path, { method: "PATCH", body: update, auth: other }))
      .status,
    404,
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: update })).status,
    200,
  );
  assert.ok(
    !(await request(prefix + "/catalog")).players.some(
      (p) => p.id === player.id,
    ),
  );
  rows = await request(path + "?teamId=" + teamId);
  assert.equal(rows.players.find((p) => p.id === player.id).active, false);
  assert.equal(
    (
      await request(path, {
        method: "PATCH",
        body: { ...update, active: true },
      })
    ).status,
    200,
  );
  assert.ok(
    (await request(prefix + "/catalog")).players.some(
      (p) => p.id === player.id,
    ),
  );
  assert.equal(
    (await request(path, { method: "PATCH", body: update })).status,
    200,
  );
  assert.equal(
    (await request(path + "?teamId=" + teamId, { auth: other })).players.length,
    0,
  );
});
