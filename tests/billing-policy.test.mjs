import { test } from "node:test";
import assert from "node:assert/strict";
import {
  teamAccess,
  billingMode,
  validInterval,
  trialDays,
} from "../src/lib/billing/policy.ts";
import {
  MAX_SEATS,
  SEAT_TIERS,
  seatTotal,
  seatUnitAmount,
  validSeats,
} from "../src/lib/billing/tiers.ts";
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
test("volume seat tiers re-rate every seat at each boundary", () => {
  for (const [seats, year, month] of [
    [1, 9900, 1000],
    [5, 9900, 1000],
    [9, 9900, 1000],
    [10, 8000, 800],
    [15, 8000, 800],
    [19, 8000, 800],
    [20, 7000, 700],
    [21, 7000, 700],
    [100, 7000, 700],
    [MAX_SEATS, 7000, 700],
  ]) {
    assert.equal(seatUnitAmount(seats, "year"), year);
    assert.equal(seatUnitAmount(seats, "month"), month);
  }
  // The tier table has an open-ended last tier so no seat count is unpriced.
  assert.equal(SEAT_TIERS.at(-1).upTo, null);
});
test("crossing a volume tier can lower the total bill, deliberately", () => {
  // Nine teams cost more than ten. This cliff is intended: the tier re-rates
  // every seat, and the pricing table is the product decision of record.
  assert.equal(seatTotal(9, "year"), 89100);
  assert.equal(seatTotal(10, "year"), 80000);
  assert.ok(seatTotal(9, "year") > seatTotal(10, "year"));
  assert.equal(seatTotal(19, "year"), 152000);
  assert.equal(seatTotal(20, "year"), 140000); // the spec's $1,400 figure
  assert.ok(seatTotal(19, "year") > seatTotal(20, "year"));
  assert.equal(seatTotal(1, "year"), 9900);
  assert.equal(seatTotal(9, "month"), 9000);
  assert.equal(seatTotal(10, "month"), 8000);
  assert.equal(seatTotal(20, "month"), 14000);
});
test("seat counts from the browser must be whole numbers inside the cap", () => {
  for (const v of [1, 2, 9, 10, 500]) assert.equal(validSeats(v), true);
  for (const v of [
    0,
    -1,
    1.5,
    501,
    "10",
    null,
    undefined,
    NaN,
    Infinity,
    {},
    [],
    true,
  ])
    assert.equal(validSeats(v), false);
  assert.equal(MAX_SEATS, 500);
});
