// Per-org localStorage keys, and the one-way migration onto them.
// MULTI-TENANT-PLAN.md T7 / §6.4 / §8 M12, phase MT-3.
//
// ---------------------------------------------------------------------------
// WHY THIS IS THE MOST DANGEROUS FILE IN THE PHASE
// ---------------------------------------------------------------------------
// §6.4 names it outright: "localStorage on Stuart's phone: one copy, no backup…
// The T7 key-namespacing rename is the single highest-risk item in this whole
// plan, because it silently orphans that blob." Everything else in MT-3 touches
// data that exists in three places (§6.4's game-data note) or in Postgres. This
// touches an in-progress game that exists nowhere else until it is synced.
//
// The rename is nonetheless necessary: two tenants on one browser — a coach who
// helps with two clubs, or Stuart demoing the product to one — would otherwise
// share a single live-scoring blob and a single game history, and the second
// login would overwrite the first club's game. No amount of server-side scoping
// helps; the collision is entirely on the device.
//
// Three properties make it safe, and all three are tested by
// scripts/verify-mt3.mjs against a real pre-006-shaped blob:
//
//   1. COPY, NEVER MOVE. The legacy key is left exactly as it was. If anything
//      about the new namespace is wrong, the original blob is still sitting
//      there under its old name for a human to recover by hand. A `removeItem`
//      here would be irreversible on a phone.
//   2. NEVER OVERWRITE. A copy happens only when the destination is ABSENT.
//      Once the app has written a single byte under the new key, that key is
//      the truth and the legacy blob is a historical artifact.
//   3. OWNER ORG ONLY. The legacy keys predate tenancy, so their contents can
//      only ever have been org-outlaws'. Copying them into another org's
//      namespace would hand a second tenant Stuart's roster and game history —
//      a cross-tenant leak entirely inside the browser, where none of the
//      SQL-layer isolation checks would ever see it.
//
// ---------------------------------------------------------------------------
// ORDERING — the failure mode that would have caused the data loss
// ---------------------------------------------------------------------------
// coach/page.tsx reads saved state DURING RENDER (`const saved =
// readSavedGameState()` feeding useState initializers) and writes it back from
// an effect that fires on the first commit. So the sequence that orphans a game
// is: read misses -> state stays at defaults -> write effect fires -> the new
// key now holds an EMPTY game -> property (2) sees a populated destination and
// declines to copy -> the real blob is stranded under the old name forever.
//
// Hence ensureCoachStorageMigrated() is called during render, before the first
// read, rather than from an effect. A side effect in render is normally a smell;
// here it is the requirement. It is idempotent, it is three getItem calls after
// the first, and it is memoized per-org below.
//
// This module imports NOTHING and touches no DOM API it was not handed. That is
// what lets scripts/verify-mt3.mjs run the migration against a Map-backed fake
// Storage, with a genuine pre-006 blob in it, in plain node.

export type CoachStorageKeys = {
  /** The live in-progress game. The irreplaceable one. */
  state: string;
  /** Saved game history, newest first. */
  history: string;
  /** The defense-rotation plan (lineup.ts). */
  lineupPlan: string;
};

// The pre-MT-3 names. `outlaws-*` despite MT-1's rename pass, because migration
// 006 deliberately left the KEYS alone and migrated only their CONTENTS — see
// coach/page.tsx's readSavedGameState() and game-types.ts:20. This is the other
// half of that deferral, arriving with the migration 006 promised it would.
export const LEGACY_COACH_STORAGE_KEYS: CoachStorageKeys = {
  state: "outlaws-field-app:v1",
  history: "outlaws-field-app:games:v1",
  lineupPlan: "warriors-coach:lineup-plan:v1",
};

// `coach:<orgId>:<what>:v1`. The org id sits in the middle rather than at the
// front so every key this app owns still sorts together in devtools, which is
// how anyone debugging a phone actually finds them.
//
// The `:v1` suffix is carried over rather than bumped: the SHAPE of the stored
// value is unchanged by this commit, and bumping a version on a pure rename
// would tell a future reader that a format change happened here when none did.
export function coachStorageKeys(orgId: string): CoachStorageKeys {
  if (!orgId) throw new Error("coachStorageKeys: orgId is required");
  return {
    state: `coach:${orgId}:state:v1`,
    history: `coach:${orgId}:games:v1`,
    lineupPlan: `coach:${orgId}:lineup-plan:v1`,
  };
}

// The slice of the Storage interface this module uses. A narrow structural type
// rather than the DOM's `Storage` so a test can pass a Map-backed fake without
// implementing `length`, `key()` and `clear()`.
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type StorageMigrationReport = {
  /** New key names that received a copy on THIS call. Empty on every re-run. */
  copied: string[];
  /** Why nothing was copied, when nothing was. For logging, not for branching. */
  skipped: "not-owner-org" | "nothing-to-copy" | null;
};

// Copies each legacy key to its org-namespaced name. See properties (1)-(3) in
// the header — every line below is one of them.
export function migrateLegacyCoachStorage(
  orgId: string,
  isOwnerOrg: boolean,
  storage: StorageLike,
): StorageMigrationReport {
  // Property (3). A non-owner org has no legacy data by definition, so there is
  // nothing to gain here and a tenant leak to lose.
  if (!isOwnerOrg) return { copied: [], skipped: "not-owner-org" };

  const next = coachStorageKeys(orgId);
  const copied: string[] = [];

  for (const field of ["state", "history", "lineupPlan"] as const) {
    const legacyKey = LEGACY_COACH_STORAGE_KEYS[field];
    const nextKey = next[field];
    if (legacyKey === nextKey) continue;

    let legacyValue: string | null = null;
    try {
      // Property (2): destination first. If anything is already there — even
      // an empty game written moments ago — this key is done.
      if (storage.getItem(nextKey) !== null) continue;
      legacyValue = storage.getItem(legacyKey);
    } catch {
      // Safari private mode and friends. A browser that cannot read storage
      // cannot lose data either; there is nothing useful to do but carry on.
      continue;
    }
    if (legacyValue === null) continue;

    try {
      storage.setItem(nextKey, legacyValue);
      copied.push(nextKey);
    } catch {
      // Quota exceeded. The legacy key is untouched (property 1), so the game
      // is still recoverable — which is the entire reason this is a copy.
      continue;
    }
    // Property (1): no removeItem. Not an oversight; do not add one.
  }

  return { copied, skipped: copied.length === 0 ? "nothing-to-copy" : null };
}

// Once per org per page load. The migration is idempotent, but it is called
// during render — including re-renders, of which a live-scoring screen has
// thousands — and three getItem calls per render for the rest of a game is a
// cost with no upside.
const migrated = new Set<string>();

export function ensureCoachStorageMigrated(
  orgId: string,
  isOwnerOrg: boolean,
  storage: StorageLike | undefined,
): void {
  if (!storage || !orgId || migrated.has(orgId)) return;
  migrated.add(orgId);
  const report = migrateLegacyCoachStorage(orgId, isOwnerOrg, storage);
  if (report.copied.length > 0) {
    console.info(`[coach] migrated legacy localStorage keys -> ${report.copied.join(", ")}`);
  }
}

// Test seam. scripts/verify-mt3.mjs runs several migrations in one process and
// must not have the memo above make the second one a no-op.
export function resetCoachStorageMigrationMemo(): void {
  migrated.clear();
}
