import { test } from "node:test";
import assert from "node:assert/strict";
import { canPlayGames } from "../src/lib/access/policy.ts";
import { playerDevGamesAccess } from "../src/lib/access/games.ts";

const legacyCoach = { orgId: "org-outlaws", role: "coach" };
const legacyViewer = { orgId: "org-outlaws", role: "viewer" };
const accountParent = {
  orgId: "org-warriors",
  role: "coach",
  userId: "user-1",
  orgRole: "member",
  teamRoles: { "team-a": "parent" },
};
const accountCoach = {
  orgId: "org-warriors",
  role: "coach",
  userId: "user-2",
  orgRole: "member",
  teamRoles: { "team-a": "head_coach" },
};
const accountManager = {
  orgId: "org-warriors",
  role: "coach",
  userId: "user-3",
  orgRole: "manager",
  teamRoles: {},
};

test("canPlayGames: anonymous (no session) is denied", () => {
  assert.equal(canPlayGames(null), false);
});
test("canPlayGames: legacy passcode coach session counts as a signed-in member", () => {
  assert.equal(canPlayGames(legacyCoach), true);
});
test("canPlayGames: legacy passcode viewer-only session is denied", () => {
  assert.equal(canPlayGames(legacyViewer), false);
});
test("canPlayGames: any #14 account session (coach, parent, manager) counts", () => {
  assert.equal(canPlayGames(accountParent), true);
  assert.equal(canPlayGames(accountCoach), true);
  assert.equal(canPlayGames(accountManager), true);
});

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("playerDevGamesAccess: anonymous is denied regardless of enforcement", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(null, async () => null);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "signed_out");
  });
});

test("playerDevGamesAccess: pilot posture (BILLING_ENFORCE unset) allows any signed-in member", async () => {
  await withEnv({ BILLING_ENFORCE: undefined }, async () => {
    delete process.env.BILLING_ENFORCE;
    const result = await playerDevGamesAccess(accountParent, async () => {
      throw new Error("billing should not be consulted while enforcement is off");
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "pilot");
  });
});

test("playerDevGamesAccess: enforced, legacy passcode session still passes (same bridge authorize.ts grants)", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(legacyCoach, async () => {
      throw new Error("billing should not be consulted for the legacy bridge");
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "legacy_session");
  });
});

test("playerDevGamesAccess: enforced, org admin passes without a per-team billing check", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(accountManager, async () => {
      throw new Error("billing should not be consulted for an org admin");
    });
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "org_admin");
  });
});

test("playerDevGamesAccess: enforced, complimentary team is good standing", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(accountCoach, async () => ({
      complimentary: true,
      subscription_status: "canceled",
      current_period_end: null,
    }));
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "good_standing");
  });
});

test("playerDevGamesAccess: enforced, active subscription is good standing", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(accountCoach, async () => ({
      complimentary: false,
      subscription_status: "active",
      current_period_end: "2030-01-01T00:00:00Z",
    }));
    assert.equal(result.allowed, true);
    assert.equal(result.reason, "good_standing");
  });
});

test("playerDevGamesAccess: enforced, no billing row for any of the member's teams is denied", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(accountCoach, async () => null);
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "billing_required");
  });
});

test("playerDevGamesAccess: enforced, lapsed subscription with no complimentary flag is denied", async () => {
  await withEnv({ BILLING_ENFORCE: "true" }, async () => {
    const result = await playerDevGamesAccess(accountCoach, async () => ({
      complimentary: false,
      subscription_status: "past_due",
      current_period_end: "2020-01-01T00:00:00Z",
    }));
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "billing_required");
  });
});
