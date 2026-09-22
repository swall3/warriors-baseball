import { test } from "node:test";
import assert from "node:assert/strict";
import {
  teamAccess,
  billingMode,
  validInterval,
  trialDays,
} from "../src/lib/billing/policy.ts";
const future = "2030-01-01T00:00:00Z";
const now = Date.parse("2026-09-22");
test("billing stays off unless explicitly configured with a test key", () => {
  for (const env of [
    {},
    { BILLING_MODE: "live", STRIPE_SECRET_KEY: "sk_live_fake" },
    { BILLING_MODE: "test", STRIPE_SECRET_KEY: "sk_live_fake" },
    { BILLING_MODE: "test" },
  ])
    assert.equal(billingMode(env), "disabled");
  assert.equal(
    billingMode({ BILLING_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fake" }),
    "test",
  );
});
test("all pilot teams retain access; complimentary teams need no subscription", () => {
  assert.equal(teamAccess(null, false, now).canStartGame, true);
  assert.equal(
    teamAccess(
      {
        complimentary: true,
        subscription_status: "canceled",
        current_period_end: null,
      },
      true,
      now,
    ).canStartGame,
    true,
  );
});
test("only current active or trialing subscriptions can start new games after enforcement", () => {
  for (const status of ["active", "trialing"])
    assert.equal(
      teamAccess(
        {
          complimentary: false,
          subscription_status: status,
          current_period_end: future,
        },
        true,
        now,
      ).canStartGame,
      true,
    );
  for (const status of [
    "none",
    "canceled",
    "past_due",
    "unpaid",
    "paused",
    "incomplete",
    "incomplete_expired",
  ]) {
    const access = teamAccess(
      {
        complimentary: false,
        subscription_status: status,
        current_period_end: future,
      },
      true,
      now,
    );
    assert.equal(access.canStartGame, false);
    assert.equal(access.canFinishGame, true);
    assert.equal(access.canReadHistory, true);
  }
  for (const end of [null, "invalid", "2020-01-01"])
    assert.equal(
      teamAccess(
        {
          complimentary: false,
          subscription_status: "active",
          current_period_end: end,
        },
        true,
        now,
      ).canStartGame,
      false,
    );
});
test("interval and trial configuration cannot accept arbitrary prices or invalid duration", () => {
  for (const v of ["month", "year"]) assert.equal(validInterval(v), true);
  for (const v of ["price_fake", "week", null, {}, true])
    assert.equal(validInterval(v), false);
  assert.equal(trialDays(undefined), 0);
  assert.equal(trialDays("14"), 14);
  for (const v of ["-1", "61", "NaN", "1.5"]) assert.throws(() => trialDays(v));
});
