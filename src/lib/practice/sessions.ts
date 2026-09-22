// Quiz session sizing (Decision 4, docs/PRACTICE-ASSIGNMENT-AND-DRILLS.md).
//
// A kid never gets handed the whole pool. Whatever the pool is — the 128-item
// scenario catalog, a 36-scenario position bundle, the rules question bank —
// it is split into sessions of at most QUIZ_SESSION_SIZE questions, and the
// kid works through one session at a time with progress carried over.
//
// IMPORTANT (PR #16): this module is deliberately pure math over counts and
// opaque string ids. It must NEVER import gameData.ts or bundles.ts. The
// games hub, the daily game, and every client game component import from
// here, and several of those render for anonymous visitors — pulling the
// catalog in "for convenience" would ship every answer into a public static
// chunk. Keep it free of content.

/**
 * The one config knob. Decision 4 allows 10–15; 12 is the middle of the band
 * and divides the common bundle sizes into even-feeling chunks.
 */
export const QUIZ_SESSION_SIZE = 12;

/**
 * How many sessions a pool of `total` items becomes.
 */
export function sessionCount(total: number, size = QUIZ_SESSION_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (size <= 0) throw new RangeError("session size must be positive");
  return Math.ceil(total / size);
}

/**
 * Session lengths for a pool of `total` items, balanced.
 *
 * Naive slicing gives 26 → [12, 12, 2], and a 2-question "session" feels like
 * a glitch to a kid. We instead pick the session COUNT from the cap and then
 * spread items as evenly as possible across that many sessions: 26 → [9, 9, 8].
 * Every session is still at or under the cap, and the remainder is spread over
 * the earliest sessions so lengths never increase.
 */
export function sessionSizes(
  total: number,
  size = QUIZ_SESSION_SIZE,
): number[] {
  const count = sessionCount(total, size);
  if (count === 0) return [];
  const base = Math.floor(total / count);
  const extra = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Split an ordered list into balanced sessions. Order within the list is
 * preserved — callers that want a shuffled session shuffle the pool BEFORE
 * chunking, so a session is still a contiguous slice of whatever order it was
 * given.
 */
export function chunkIntoSessions<T>(
  items: T[],
  size = QUIZ_SESSION_SIZE,
): T[][] {
  const sizes = sessionSizes(items.length, size);
  const out: T[][] = [];
  let at = 0;
  for (const n of sizes) {
    out.push(items.slice(at, at + n));
    at += n;
  }
  return out;
}

/**
 * Which session to serve next given how many the kid has already finished.
 * Wraps around so a kid who finishes a whole bundle starts over at session 1
 * rather than hitting a dead end. Returns 0 for an empty pool.
 */
export function nextSessionIndex(
  completedSessions: number,
  total: number,
  size = QUIZ_SESSION_SIZE,
): number {
  const count = sessionCount(total, size);
  if (count === 0) return 0;
  const done = Number.isFinite(completedSessions)
    ? Math.max(0, Math.floor(completedSessions))
    : 0;
  return done % count;
}

export type SessionPlan = {
  /** 0-based index of the session being played. */
  index: number;
  /** 1-based, for display ("Session 3 of 7"). */
  number: number;
  /** Total sessions this pool splits into. */
  count: number;
  /** Item count in this particular session. */
  length: number;
  /** True when this session finishes a full pass through the pool. */
  completesPool: boolean;
};

/**
 * Everything the UI needs to describe the session a kid is about to play.
 */
export function planSession(
  total: number,
  completedSessions: number,
  size = QUIZ_SESSION_SIZE,
): SessionPlan {
  const sizes = sessionSizes(total, size);
  const index = nextSessionIndex(completedSessions, total, size);
  return {
    index,
    number: sizes.length === 0 ? 0 : index + 1,
    count: sizes.length,
    length: sizes[index] ?? 0,
    completesPool: sizes.length > 0 && index === sizes.length - 1,
  };
}

/**
 * Spread items across their groups so that any contiguous slice — i.e. any
 * session — draws from every group instead of being all one kind.
 *
 * This is how a position bundle ends up mixing cover/backup/relay/miss in a
 * single sitting without reordering the bundle's stored `scenarioIds`: the
 * bundle keeps catalog order (which `training_assignments.bundle_position`
 * rows were written against), and the mixing happens here, at the session
 * presentation layer. Deliberately group-agnostic — it takes a key function,
 * so it never needs to know what a scenario category is.
 *
 * Note this is a proportional spread, not a plain round robin. Round robin
 * exhausts the small groups first, so a position with 11 cover scenarios and
 * 4 miss-recovery ones would serve every miss-recovery rep in session one and
 * none after that. Spreading by relative position inside each group keeps the
 * rare skills sprinkled through the whole walk. Deterministic: ties break by
 * first-appearance group order, and order within a group is preserved.
 */
export function interleaveByGroup<T>(
  items: T[],
  groupOf: (item: T) => string,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = groupOf(item);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const keyed: { item: T; at: number; group: number; within: number }[] = [];
  let group = 0;
  for (const bucket of buckets.values()) {
    bucket.forEach((item, i) => {
      keyed.push({ item, at: (i + 0.5) / bucket.length, group, within: i });
    });
    group++;
  }
  keyed.sort(
    (a, b) => a.at - b.at || a.group - b.group || a.within - b.within,
  );
  return keyed.map((k) => k.item);
}

/**
 * Pick the items for a planned session out of an already-ordered pool.
 */
export function sessionSlice<T>(
  items: T[],
  completedSessions: number,
  size = QUIZ_SESSION_SIZE,
): T[] {
  const chunks = chunkIntoSessions(items, size);
  if (chunks.length === 0) return [];
  return chunks[nextSessionIndex(completedSessions, items.length, size)];
}
