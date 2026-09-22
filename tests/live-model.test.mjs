import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeGame,
  applyCommand,
  batter,
  battingSide,
  fieldPositions,
} from "../src/lib/coach/live/model.ts";
const roster = Array.from({ length: 12 }, (_, i) => ({
  id: `p${i}`,
  name: `Player ${i + 1}`,
}));
const config = {
  teamId: "team-a",
  teamName: "Team A",
  opponent: "Team B",
  date: "2026-09-21",
  usAreHome: true,
  format: "kid_pitch",
  innings: 6,
  roster,
  order: roster.map((p) => p.id),
  opponentOrder: roster.map((p) => ({
    id: `opp-${p.id}`,
    name: `Opponent ${p.id}`,
  })),
  positions: Object.fromEntries(
    fieldPositions("kid_pitch").map((p, i) => [p, roster[i].id]),
  ),
  crewMode: "split",
};
let id = 0;
const now = "2026-09-21T12:00:00Z";
const act = (s, c, lane = "coach") => applyCommand(s, c, `c${++id}`, lane, now);
const live = () => act(makeGame("g1", config, now), { type: "start" });
test("all delivered pitches count, including walk and two-strike fouls", () => {
  let s = live();
  for (let i = 0; i < 4; i++)
    s = act(s, { type: "pitch", outcome: "ball" }, "pitch");
  assert.equal(s.pitchCounts["us:p0"], 4);
  assert.equal(s.bases["1"].id, "opp-p0");
  assert.equal(s.balls, 0);
  for (const outcome of [
    "called_strike",
    "swinging_strike",
    "foul",
    "foul",
    "swinging_strike",
  ])
    s = act(s, { type: "pitch", outcome }, "pitch");
  assert.equal(s.pitchCounts["us:p0"], 9);
  assert.equal(s.outs, 1);
  assert.equal(batter(s).id, "opp-p2");
});
test("split recording links result to one pitch and rejects duplicate resolution", () => {
  let s = act(live(), { type: "pitch", outcome: "in_play" }, "pitch");
  const p = s.pending;
  const command = {
    type: "result",
    pitchId: p.id,
    result: "double",
    zone: "LF",
    moves: [{ id: p.batter.id, to: "2" }],
    countRunsOnThirdOut: false,
  };
  assert.throws(
    () => act(s, { type: "pitch", outcome: "ball" }, "pitch"),
    /Finish/,
  );
  assert.throws(
    () => act(s, { ...command, pitchId: "other" }, "play"),
    /match/,
  );
  s = act(s, command, "play");
  assert.equal(s.pitchCounts["us:p0"], 1);
  assert.equal(s.bases["2"].id, p.batter.id);
  assert.throws(() => act(s, command, "play"), /match/);
});
test("role checks run in model and no role can configure a live lineup", () => {
  let s = live();
  assert.throws(
    () => act(s, { type: "pitch", outcome: "ball" }, "display"),
    /role/,
  );
  assert.throws(
    () => act(s, { type: "pitch", outcome: "ball" }, "play"),
    /role/,
  );
  assert.throws(() => act(s, { type: "finish" }, "all"), /role/);
  assert.throws(() => act(s, { type: "configure", config }), /locked/);
});
test("pitcher substitution keeps counts and exchanges defensive positions", () => {
  let s = act(live(), { type: "pitch", outcome: "ball" });
  s = act(s, { type: "pitcher", side: "us", pitcher: roster[3] });
  s = act(s, { type: "pitch", outcome: "ball" });
  assert.equal(s.pitchCounts["us:p0"], 1);
  assert.equal(s.pitchCounts["us:p3"], 1);
  assert.equal(s.config.positions.P, "p3");
  assert.equal(s.config.positions["2B"], "p0");
});
test("scheduled defense publishes only at next defensive half and order continues", () => {
  let s = live();
  for (let i = 0; i < 4; i++) s = act(s, { type: "pitch", outcome: "ball" });
  const positions = {
    ...s.config.positions,
    LF: s.config.positions.CF,
    CF: s.config.positions.LF,
  };
  s = act(s, { type: "defense", positions, when: "next" });
  s = act(s, { type: "advance" });
  assert.equal(battingSide(s), "us");
  assert.notEqual(s.config.positions.LF, positions.LF);
  s = act(s, { type: "advance" });
  assert.equal(s.config.positions.LF, positions.LF);
  assert.equal(batter(s).id, "opp-p1");
});
test("runner moves reject collisions and correctly handle a third-out run decision", () => {
  let s = live();
  for (let i = 0; i < 4; i++) s = act(s, { type: "pitch", outcome: "ball" });
  s = act(s, { type: "pitch", outcome: "in_play" });
  const c = {
    type: "result",
    pitchId: s.pending.id,
    result: "single",
    zone: "RF",
    moves: [
      { id: "opp-p0", to: "1" },
      { id: "opp-p1", to: "1" },
    ],
    countRunsOnThirdOut: false,
  };
  assert.throws(() => act(s, c), /same base/);
  assert.equal(s.bases["1"].id, "opp-p0");
  s = { ...s, outs: 2 };
  s = act(s, {
    ...c,
    moves: [
      { id: "opp-p0", to: "home" },
      { id: "opp-p1", to: "out" },
    ],
  });
  assert.equal(s.score.them, 0);
  assert.equal(s.half, "bottom");
});
test("undo is conditional on the last action and restores its entire state", () => {
  let s = act(live(), { type: "pitch", outcome: "in_play" });
  const pending = s.pending;
  s = act(s, {
    type: "result",
    pitchId: pending.id,
    result: "out",
    zone: "SS",
    moves: [{ id: pending.batter.id, to: "out" }],
    countRunsOnThirdOut: false,
  });
  assert.throws(() => act(s, { type: "undo", targetId: "stale" }), /latest/);
  s = act(s, { type: "undo", targetId: s.undo.id });
  assert.equal(s.outs, 0);
  assert.equal(s.pending.id, pending.id);
  assert.equal(s.pitchCounts["us:p0"], 1);
});
test("finalization waits for pending plays, rejects recording and can be corrected by coach", () => {
  let s = act(live(), { type: "pitch", outcome: "in_play" });
  assert.throws(() => act(s, { type: "finish" }), /pending/);
  s = act(s, { type: "undo", targetId: s.undo.id });
  s = act(s, { type: "finish" });
  assert.throws(() => act(s, { type: "pitch", outcome: "ball" }), /final/);
  s = act(s, { type: "undo", targetId: s.undo.id });
  assert.equal(s.status, "live");
});
test("coach-pitch shape uses ten fielders and coach deliveries, invalid config fails closed", () => {
  const c = {
    ...config,
    format: "coach_pitch",
    positions: Object.fromEntries(
      fieldPositions("coach_pitch").map((p, i) => [p, roster[i].id]),
    ),
  };
  let s = act(makeGame("g2", c, now), { type: "start" });
  s = act(s, { type: "pitch", outcome: "ball" });
  assert.equal(s.pitchCounts["us:coach"], 1);
  assert.equal(Object.keys(s.config.positions).length, 10);
  assert.throws(
    () => makeGame("g3", { ...config, order: ["missing"] }, now),
    /unknown/,
  );
  assert.throws(
    () =>
      act(makeGame("g4", { ...config, positions: {} }, now), { type: "start" }),
    /Fill all/,
  );
});
test("coach pitch does not impose unverified walk/strike thresholds", () => {
  const c = {
    ...config,
    format: "coach_pitch",
    positions: Object.fromEntries(
      fieldPositions("coach_pitch").map((p, i) => [p, roster[i].id]),
    ),
  };
  let s = act(makeGame("g5", c, now), { type: "start" });
  for (let i = 0; i < 5; i++)
    s = act(s, { type: "pitch", outcome: "ball" }, "pitch");
  assert.equal(s.balls, 5);
  assert.equal(s.bases["1"], null);
  s = act(s, { type: "end_at_bat", outcome: "walk" }, "pitch");
  assert.equal(s.bases["1"].id, "opp-p0");
  assert.equal(s.pitchCounts["us:coach"], 5);
  for (let i = 0; i < 3; i++)
    s = act(s, { type: "pitch", outcome: "called_strike" }, "pitch");
  s = act(s, { type: "pitch", outcome: "foul" }, "pitch");
  assert.equal(s.strikes, 3);
  assert.equal(s.outs, 0);
  s = act(s, { type: "end_at_bat", outcome: "strikeout" }, "pitch");
  assert.equal(s.outs, 1);
  assert.equal(s.pitchCounts["us:coach"], 9);
});

test("coach corrections validate runners/counts, retain audit reason and undo atomically", () => {
  let s = act(live(), { type: "pitch", outcome: "ball" });
  const correction = {
    type: "correct",
    reason: "Missed pitch and runner placement",
    balls: 2,
    strikes: 1,
    outs: 1,
    score: { us: 0, them: 1 },
    bases: { 1: null, 2: "opp-p0", 3: null },
    pitchCounts: { "us:p0": 3 },
  };
  assert.throws(() => act(s, correction, "pitch"), /role/);
  assert.throws(() => act(s, { ...correction, reason: "" }), /Explain/);
  assert.throws(() => act(s, { ...correction, balls: 4 }), /count/);
  assert.throws(
    () => act(s, { ...correction, bases: { 1: "p0", 2: null, 3: null } }),
    /batting team/,
  );
  assert.throws(
    () => act(s, { ...correction, pitchCounts: { "us:unknown": 20 } }),
    /pitchers/,
  );
  const fixed = act(s, correction);
  assert.equal(fixed.bases["2"].id, "opp-p0");
  assert.equal(fixed.pitchCounts["us:p0"], 3);
  assert.equal(fixed.balls, 2);
  const undone = act(fixed, { type: "undo", targetId: fixed.undo.id });
  assert.equal(undone.balls, 1);
  assert.equal(undone.pitchCounts["us:p0"], 1);
});
