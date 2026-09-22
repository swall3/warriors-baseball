// Isolated local integration only. Never point this harness at a deployment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
if (process.env.TEST_HISTORY_OUTAGE === "1") {
 test("configured database failure never substitutes sample games", async()=>{
  const games=await request(prefix+"/games");
  assert.equal(games.status,503);
  assert.equal(games.games,undefined);
  assert.match(games.error,/unavailable/i);
 });
} else test("historical reads are paginated, org scoped, private and preserve event types",async()=>{
 const games=await request(prefix+"/games");assert.equal(games.status,200);
 const fixture=games.games.find(g=>g.id==="history-review");assert.equal(fixture.pinCount,1101);
 assert.ok(!fixture.pins.some(e=>e.id==="review-pitch"));
 const rows=await request(prefix+"/play-events?id=history-review&team=all");assert.equal(rows.events.length,1102);
 assert.equal(rows.events.find(e=>e.id==="review-pitch").eventType,"pitch");
 assert.equal((await request(prefix+"/play-events?id=history-review&team=invalid")).status,400);
 assert.equal((await request(prefix+"/play-events?id=history-review&team=all",{auth:other})).status,404);
 assert.ok(!(await request(prefix+"/games",{auth:other})).games.some(g=>g.id==="history-review"));
 const response=await fetch(base+prefix+"/games",{headers:{cookie:coach}});assert.match(response.headers.get("cache-control"),/no-store/);
});
