import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Requires the disposable access-api fixtures, auth proxy, and progress
// migrations. Never point GAME_PROGRESS_BASE at a deployed app.
const base = process.env.GAME_PROGRESS_BASE ?? "http://localhost:4185";
const path = "/api/coach/games/progress?player=access-api-child";
const headers = {
  cookie: "iw_account=local-access-parent; iw_organization=access-api",
  origin: base,
  "Content-Type": "application/json",
};

test("linked parent progress increments once, rejects replay and other players", async () => {
  const read = async () => {
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 200);
    const data = await response.json();
    return data.progress.find((row: { game_key: string }) =>
      row.game_key === "regression-test");
  };
  const before = await read();
  const body = JSON.stringify({
    attemptId: randomUUID(), gameKey: "regression-test", correct: true,
  });
  const post = (url = path, requestHeaders = headers) =>
    fetch(base + url, { method: "POST", headers: requestHeaders, body });
  const first = await post();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).recorded, true);
  const replay = await post();
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).recorded, false);
  const after = await read();
  assert.equal(after.total, (before?.total ?? 0) + 1);
  assert.equal(after.correct, (before?.correct ?? 0) + 1);
  assert.equal((await post("/api/coach/games/progress?player=review-2")).status, 403);
  assert.equal((await post(path, { ...headers, origin: "https://elsewhere.example" })).status, 403);
});
