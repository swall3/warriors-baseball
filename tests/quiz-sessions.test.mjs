// Quiz session chunking math (Decision 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUIZ_SESSION_SIZE,
  sessionCount,
  sessionSizes,
  chunkIntoSessions,
  nextSessionIndex,
  planSession,
  sessionSlice,
  interleaveByGroup,
} from "../src/lib/practice/sessions.ts";

test("the cap is a single config constant inside Decision 4's 10-15 band", () => {
  assert.equal(typeof QUIZ_SESSION_SIZE, "number");
  assert.ok(QUIZ_SESSION_SIZE >= 10 && QUIZ_SESSION_SIZE <= 15);
});

test("sessions.ts imports no scenario content (PR #16 chunk hygiene)", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/lib/practice/sessions.ts", import.meta.url), "utf8"),
  );
  assert.ok(!/^import /m.test(src), "sessions.ts must stay dependency-free");
  assert.ok(!/gameData|bundles/.test(src.replace(/\/\/.*$/gm, "")));
});

test("an empty pool has no sessions", () => {
  assert.equal(sessionCount(0), 0);
  assert.deepEqual(sessionSizes(0), []);
  assert.deepEqual(chunkIntoSessions([]), []);
});

test("a pool smaller than the cap is exactly one session", () => {
  assert.equal(sessionCount(5), 1);
  assert.deepEqual(sessionSizes(5), [5]);
  assert.deepEqual(chunkIntoSessions([1, 2, 3, 4, 5]), [[1, 2, 3, 4, 5]]);
});

test("a pool exactly the cap is one full session", () => {
  assert.equal(sessionCount(QUIZ_SESSION_SIZE), 1);
  assert.deepEqual(sessionSizes(QUIZ_SESSION_SIZE), [QUIZ_SESSION_SIZE]);
});

test("one over the cap becomes two balanced sessions, not 12 + 1", () => {
  const sizes = sessionSizes(QUIZ_SESSION_SIZE + 1);
  assert.equal(sizes.length, 2);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, sizes.join(","));
});

test("sessions are balanced rather than naively sliced", () => {
  // 26 items at a cap of 12 → 3 sessions of 9/9/8, never 12/12/2.
  assert.deepEqual(sessionSizes(26, 12), [9, 9, 8]);
  assert.deepEqual(sessionSizes(13, 12), [7, 6]);
  assert.deepEqual(sessionSizes(25, 12), [9, 8, 8]);
});

test("no session ever exceeds the cap, for every pool size up to 500", () => {
  for (let n = 1; n <= 500; n++) {
    const sizes = sessionSizes(n);
    assert.ok(
      Math.max(...sizes) <= QUIZ_SESSION_SIZE,
      `pool ${n} produced a session of ${Math.max(...sizes)}`,
    );
    assert.equal(
      sizes.reduce((a, b) => a + b, 0),
      n,
      `pool ${n} lost or gained items`,
    );
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `pool ${n} unbalanced`);
  }
});

test("session lengths never increase, so remainders land early", () => {
  for (let n = 1; n <= 200; n++) {
    const sizes = sessionSizes(n);
    for (let i = 1; i < sizes.length; i++)
      assert.ok(sizes[i] <= sizes[i - 1], `pool ${n} sizes ${sizes.join(",")}`);
  }
});

test("chunking partitions the pool with no gaps, overlaps or reordering", () => {
  const items = Array.from({ length: 128 }, (_, i) => i);
  const chunks = chunkIntoSessions(items);
  assert.deepEqual(chunks.flat(), items);
});

test("a large multiple of the cap chunks exactly", () => {
  const sizes = sessionSizes(QUIZ_SESSION_SIZE * 10);
  assert.equal(sizes.length, 10);
  assert.ok(sizes.every((s) => s === QUIZ_SESSION_SIZE));
});

test("nextSessionIndex advances with completions and wraps at the end", () => {
  assert.equal(nextSessionIndex(0, 26, 12), 0);
  assert.equal(nextSessionIndex(1, 26, 12), 1);
  assert.equal(nextSessionIndex(2, 26, 12), 2);
  assert.equal(nextSessionIndex(3, 26, 12), 0, "wraps to session 1");
  assert.equal(nextSessionIndex(7, 26, 12), 1);
});

test("nextSessionIndex is defensive about junk stored progress", () => {
  assert.equal(nextSessionIndex(-5, 26, 12), 0);
  assert.equal(nextSessionIndex(1.7, 26, 12), 1);
  assert.equal(nextSessionIndex(Number.NaN, 26, 12), 0);
  assert.equal(nextSessionIndex(3, 0, 12), 0, "empty pool never indexes");
});

test("planSession describes the session a kid is about to play", () => {
  assert.deepEqual(planSession(26, 0, 12), {
    index: 0,
    number: 1,
    count: 3,
    length: 9,
    completesPool: false,
  });
  assert.deepEqual(planSession(26, 2, 12), {
    index: 2,
    number: 3,
    count: 3,
    length: 8,
    completesPool: true,
  });
  assert.deepEqual(planSession(0, 0, 12), {
    index: 0,
    number: 0,
    count: 0,
    length: 0,
    completesPool: false,
  });
});

test("a kid walking a pool sees every item exactly once before repeating", () => {
  const items = Array.from({ length: 31 }, (_, i) => `s${i}`);
  const { count } = planSession(items.length, 0);
  const seen = [];
  for (let done = 0; done < count; done++)
    seen.push(...sessionSlice(items, done));
  assert.deepEqual(seen.sort(), [...items].sort());
  // The pass after a full walk starts over at session one.
  assert.deepEqual(sessionSlice(items, count), sessionSlice(items, 0));
});

test("interleaveByGroup spreads groups so any session mixes skills", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, g: "cover" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, g: "backup" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, g: "relay" })),
    ...Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, g: "miss" })),
  ];
  const mixed = interleaveByGroup(items, (i) => i.g);
  assert.equal(mixed.length, items.length);
  assert.deepEqual(
    mixed.map((i) => i.id).sort(),
    items.map((i) => i.id).sort(),
    "interleaving must not lose or duplicate items",
  );
  for (const session of chunkIntoSessions(mixed)) {
    assert.equal(
      new Set(session.map((i) => i.g)).size,
      4,
      "every session should touch all four skills",
    );
  }
});

test("interleaveByGroup handles lopsided groups without dropping the tail", () => {
  const items = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, g: "cover" })),
    { id: "b0", g: "backup" },
  ];
  const mixed = interleaveByGroup(items, (i) => i.g);
  assert.equal(mixed.length, 21);
  assert.equal(new Set(mixed.map((i) => i.id)).size, 21);
  // A single rare item lands mid-walk, not stapled to the front — a plain
  // round robin would put it second and never show that skill again.
  const at = mixed.findIndex((i) => i.id === "b0");
  assert.ok(at > 5 && at < 15, `rare item landed at ${at}`);
});

test("interleaveByGroup spreads a rare skill across the whole walk, not just session one", () => {
  // The pitcher bundle shape: a big group and a much smaller one.
  const items = [
    ...Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, g: "cover" })),
    ...Array.from({ length: 11 }, (_, i) => ({ id: `b${i}`, g: "backup" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, g: "relay" })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: `m${i}`, g: "miss" })),
  ];
  const sessions = chunkIntoSessions(interleaveByGroup(items, (i) => i.g));
  assert.ok(sessions.length >= 3);
  for (const [i, session] of sessions.entries())
    assert.ok(
      new Set(session.map((x) => x.g)).size >= 3,
      `session ${i + 1} only had ${new Set(session.map((x) => x.g)).size} skills`,
    );
});

test("interleaveByGroup is deterministic and stable within a group", () => {
  const items = [
    { id: "a0", g: "x" },
    { id: "b0", g: "y" },
    { id: "a1", g: "x" },
    { id: "a2", g: "x" },
  ];
  const once = interleaveByGroup(items, (i) => i.g).map((i) => i.id);
  const twice = interleaveByGroup(items, (i) => i.g).map((i) => i.id);
  assert.deepEqual(once, twice);
  assert.deepEqual(once, ["a0", "a1", "b0", "a2"]);
});

test("interleaving an empty or single-group list is a no-op", () => {
  assert.deepEqual(interleaveByGroup([], () => "x"), []);
  const same = [{ id: 1, g: "x" }, { id: 2, g: "x" }];
  assert.deepEqual(interleaveByGroup(same, (i) => i.g), same);
});

// ── Assigned-practice run splitting (mirrors PracticeSession.tsx) ──
// The coach-side timed runner walks assigned rows in the coach's order. This
// mirrors how it splits that list so a 30-rep bundle isn't 30 timed blocks.

test("an assigned bundle splits into capped, contiguous, in-order sessions", () => {
  const assigned = Array.from({ length: 36 }, (_, i) => ({
    id: `row${i}`,
    bundle_position: i,
  }));
  const sessions = chunkIntoSessions(assigned);
  assert.equal(sessions.length, 3);
  for (const s of sessions) assert.ok(s.length <= QUIZ_SESSION_SIZE);
  // Contiguous and in the coach's assigned order — session 2 picks up exactly
  // where session 1 stopped.
  assert.deepEqual(
    sessions.flat().map((r) => r.bundle_position),
    assigned.map((r) => r.bundle_position),
  );
});

test("a small assignment stays a single session with no split UI needed", () => {
  const assigned = Array.from({ length: 4 }, (_, i) => ({ id: `row${i}` }));
  const sessions = chunkIntoSessions(assigned);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].length, 4);
});

test("no assigned rows means no session to start", () => {
  assert.deepEqual(chunkIntoSessions([]), []);
});
