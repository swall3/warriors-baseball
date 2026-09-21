// Isolated local integration only. Never point this harness at a deployment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { signSession } from "../src/lib/coach/session.ts";
const base = "http://127.0.0.1:4180";
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
test("authenticated multi-recorder lifecycle, persisted insights and training", async () => {
  const catalog = await request(prefix + "/catalog");
  assert.equal(catalog.status, 200);
  const roster = catalog.players
    .filter((p) => p.team_id === "team-review-warriors")
    .map((p) => ({ id: p.id, name: p.display_name }));
  const positions = Object.fromEntries(
    ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].map((p, i) => [
      p,
      roster[i].id,
    ]),
  );
  const config = {
    teamId: "team-review-warriors",
    teamName: "Warriors",
    opponent: "API Test Opponent",
    date: "2026-09-21",
    usAreHome: true,
    format: "kid_pitch",
    innings: 6,
    roster,
    order: roster.map((p) => p.id),
    opponentOrder: Array.from({ length: 9 }, (_, i) => ({
      id: `o${i}`,
      name: `Batter ${i + 1}`,
    })),
    positions,
    crewMode: "split",
  };
  assert.equal(
    (
      await request(prefix + "/live", {
        method: "POST",
        body: { config },
        auth: viewer,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(prefix + "/live", {
        method: "POST",
        body: { config },
        origin: "https://foreign.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(prefix + "/live", {
        method: "POST",
        body: { config },
        auth: other,
      })
    ).status,
    404,
  );
  const created = await request(prefix + "/live", {
    method: "POST",
    body: { config },
  });
  assert.equal(created.status, 201);
  let game = created.game;
  const url = prefix + "/live/" + game.id;
  assert.equal((await request(url, { auth: other })).status, 404);
  const grant = async (lane) => {
    const r = await request(url + "/crew", {
      method: "POST",
      body: { lane, label: `Test ${lane}` },
    });
    assert.equal(r.status, 201);
    return r.grant;
  };
  const pitch = await grant("pitch");
  const play = await grant("play");
  const all = await grant("all");
  const send = async (command, options = {}) => {
    const body = { id: randomUUID(), expectedRevision: game.revision, command };
    const r = await request(url, { method: "POST", body, ...options });
    if (r.status === 200) game = r.game;
    return { ...r, body };
  };
  assert.equal((await send({ type: "start" }, { auth: viewer })).status, 403);
  assert.equal((await send({ type: "start" })).status, 200);
  assert.equal(
    (await send({ type: "finish" }, { auth: viewer, token: pitch.token }))
      .status,
    403,
  );
  assert.equal(
    (
      await send(
        { type: "pitch", outcome: "ball" },
        { auth: viewer, token: play.token },
      )
    ).status,
    403,
  );
  const ball = await send(
    { type: "pitch", outcome: "ball" },
    { auth: viewer, token: pitch.token },
  );
  assert.equal(ball.status, 200);
  const retry = await request(url, {
    method: "POST",
    body: ball.body,
    auth: viewer,
    token: pitch.token,
  });
  assert.equal(retry.duplicate, true);
  assert.equal(retry.game.revision, game.revision);
  assert.equal(
    (
      await request(url, {
        method: "POST",
        body: { ...ball.body, command: { type: "pitch", outcome: "foul" } },
        auth: viewer,
        token: pitch.token,
      })
    ).status,
    409,
  );
  const inPlay = await send(
    { type: "pitch", outcome: "in_play" },
    { auth: viewer, token: pitch.token },
  );
  assert.equal(inPlay.status, 200);
  assert.equal((await send({ type: "finish" })).status, 400);
  const result = await send(
    {
      type: "result",
      pitchId: game.pending.id,
      result: "double",
      zone: "LF",
      moves: [{ id: "o0", to: "2" }],
      countRunsOnThirdOut: false,
    },
    { auth: viewer, token: play.token },
  );
  assert.equal(result.status, 200);
  assert.equal(game.pitchCounts["us:" + roster[0].id], 2);
  assert.equal(game.bases["2"].id, "o0");
  let insights = await request(url + "/insights");
  assert.equal(insights.status, 200);
  assert.deepEqual(insights.insights.zones, [["LF", 1]]);
  assert.equal(insights.insights.contacts[0].batter, "Batter 1");
  await send({ type: "undo", targetId: result.body.id });
  insights = await request(url + "/insights");
  assert.equal(insights.insights.contacts.length, 0);
  await send({ ...result.body.command }, { auth: viewer, token: play.token });
  await send({ type: "pitcher", side: "us", pitcher: roster[3] });
  await send(
    { type: "pitch", outcome: "called_strike" },
    { auth: viewer, token: all.token },
  );
  assert.equal(game.pitchCounts["us:" + roster[3].id], 1);
  assert.equal(game.pitchCounts["us:" + roster[0].id], 2);
  const rev = game.revision;
  const raced = await Promise.all(
    ["ball", "foul"].map((outcome) =>
      request(url, {
        method: "POST",
        body: {
          id: randomUUID(),
          expectedRevision: rev,
          command: { type: "pitch", outcome },
        },
        auth: viewer,
        token: all.token,
      }),
    ),
  );
  assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
  game = raced.find((r) => r.status === 200).game;
  const revoked = await request(url + "/crew", {
    method: "DELETE",
    body: { id: pitch.id },
  });
  assert.equal(revoked.status, 200);
  assert.equal(
    (await request(url, { auth: viewer, token: pitch.token })).status,
    403,
  );
  assert.equal((await send({ type: "finish" })).status, 200);
  assert.equal(game.status, "final");
  assert.equal((await send({ type: "pitch", outcome: "ball" })).status, 400);
  const practice = {
    playerId: roster[0].id,
    gameId: game.id,
    scenarioId: "b1",
    note: "Find the backup.",
  };
  assert.equal(
    (
      await request(prefix + "/training", {
        method: "POST",
        body: practice,
        auth: viewer,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(prefix + "/training", {
        method: "POST",
        body: practice,
        auth: other,
      })
    ).status,
    404,
  );
  const assigned = await request(prefix + "/training", {
    method: "POST",
    body: practice,
  });
  assert.equal(assigned.status, 201);
  const assignmentUrl = prefix + "/training/" + assigned.assignment.id;
  assert.equal(
    (
      await request(assignmentUrl, {
        method: "POST",
        body: { id: randomUUID(), answer: "CF" },
        auth: other,
      })
    ).status,
    404,
  );
  const wrong = await request(assignmentUrl, {
    method: "POST",
    body: { id: randomUUID(), answer: "P" },
    auth: viewer,
  });
  assert.equal(wrong.correct, false);
  const attempt = { id: randomUUID(), answer: "CF" };
  const correct = await request(assignmentUrl, {
    method: "POST",
    body: attempt,
    auth: viewer,
  });
  assert.equal(correct.correct, true);
  const duplicate = await request(assignmentUrl, {
    method: "POST",
    body: attempt,
    auth: viewer,
  });
  assert.equal(duplicate.duplicate, true);
  const attempts = await request(prefix + "/training");
  const saved = attempts.assignments.find(
    (a) => a.id === assigned.assignment.id,
  );
  assert.equal(saved.attempts, 2);
  assert.equal(saved.correct, 1);
  assert.equal(
    (await request(prefix + "/training", { auth: other })).assignments.some(
      (a) => a.id === assigned.assignment.id,
    ),
    false,
  );
});

test("six-inning game preserves split-recorder pitch totals and display state", async () => {
  const catalog = await request(prefix + "/catalog");
  const roster = catalog.players
    .filter((p) => p.team_id === "team-review-warriors")
    .map((p) => ({ id: p.id, name: p.display_name }));
  const positions = Object.fromEntries(
    ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].map((p, i) => [
      p,
      roster[i].id,
    ]),
  );
  const created = await request(prefix + "/live", {
    method: "POST",
    body: {
      config: {
        teamId: "team-review-warriors",
        teamName: "Warriors",
        opponent: "Six inning review",
        date: "2026-09-21",
        usAreHome: true,
        format: "kid_pitch",
        innings: 6,
        roster,
        order: roster.map((p) => p.id),
        opponentOrder: roster.map((_, i) => ({
          id: `op-${i}`,
          name: `Opponent ${i + 1}`,
        })),
        positions,
        crewMode: "split",
      },
    },
  });
  assert.equal(created.status, 201);
  let game = created.game;
  const url = prefix + "/live/" + game.id;
  const grant = async (lane) =>
    (
      await request(url + "/crew", {
        method: "POST",
        body: { lane, label: `Six inning ${lane}` },
      })
    ).grant;
  const pitch = await grant("pitch"),
    play = await grant("play"),
    display = await grant("display");
  const send = async (command, token) => {
    const response = await request(url, {
      method: "POST",
      body: { id: randomUUID(), expectedRevision: game.revision, command },
      ...(token ? { auth: viewer, token } : {}),
    });
    assert.equal(response.status, 200, JSON.stringify(response));
    game = response.game;
  };
  await send({ type: "start" });
  await send({ type: "pitch", outcome: "in_play" }, pitch.token);
  await send(
    {
      type: "result",
      pitchId: game.pending.id,
      result: "home_run",
      zone: "LF",
      moves: [{ id: game.pending.batter.id, to: "home" }],
      countRunsOnThirdOut: false,
    },
    play.token,
  );
  assert.equal(game.score.them, 1);
  for (let half = 0; half < 12; half++) {
    if (half === 6)
      await send({ type: "pitcher", side: "us", pitcher: roster[3] });
    for (let out = 0; out < 3; out++)
      for (let strike = 0; strike < 3; strike++)
        await send({ type: "pitch", outcome: "called_strike" }, pitch.token);
    const board = await request(url, { auth: viewer, token: display.token });
    assert.equal(board.status, 200);
    assert.equal(board.game.revision, game.revision);
    assert.deepEqual(board.game.score, game.score);
    assert.deepEqual(board.game.pitchCounts, game.pitchCounts);
    assert.equal(game.outs, 0);
  }
  await send({ type: "finish" });
  assert.equal(game.status, "final");
  assert.equal(game.score.us, 0);
  assert.equal(game.score.them, 1);
  assert.equal(game.pitchCounts["us:" + roster[0].id], 28);
  assert.equal(game.pitchCounts["us:" + roster[3].id], 27);
  assert.equal(
    Object.values(game.pitchCounts).reduce((sum, n) => sum + n, 0),
    109,
  );
  const final = await request(url, { auth: viewer, token: display.token });
  assert.equal(final.game.status, "final");
  assert.equal(
    (
      await request(url, {
        auth: viewer,
        token: display.token,
        method: "POST",
        body: {
          id: randomUUID(),
          expectedRevision: game.revision,
          command: { type: "undo", targetId: randomUUID() },
        },
      })
    ).status,
    403,
  );
  const insights = await request(url + "/insights");
  assert.deepEqual(insights.insights.zones, [["LF", 1]]);
});
