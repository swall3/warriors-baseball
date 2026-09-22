// Operator-only Stripe provisioning. Creates the seat product and the two
// tiered-volume prices whose amounts live in src/lib/billing/tiers.ts.
// Run from an operator terminal:
//   node --env-file=<server-env-file> scripts/configure-seat-prices.mjs
// Prints the two price IDs for STRIPE_TEAM_MONTHLY_PRICE_ID /
// STRIPE_TEAM_ANNUAL_PRICE_ID. It never writes environment or database state.
//
// Stripe prices are immutable: a tier change means a NEW price plus a
// subscription migration, not an edit. Re-running this creates new prices.
import Stripe from "stripe";
import { SEAT_TIERS } from "../src/lib/billing/tiers.ts";
const key = process.env.STRIPE_SECRET_KEY;
// Same rule as billingMode(): this release deliberately cannot touch live money.
// Duplicated rather than imported so the script never pulls in the Next runtime.
if (process.env.BILLING_MODE !== "test" || !key?.startsWith("sk_test_"))
  throw new Error(
    "Refusing to run: set BILLING_MODE=test and an sk_test_ STRIPE_SECRET_KEY. Live mode is unsupported.",
  );
const stripe = new Stripe(key, { timeout: 20000, maxNetworkRetries: 1 });
const tiers = (interval) =>
  SEAT_TIERS.map((t) => ({
    up_to: t.upTo ?? "inf",
    unit_amount: t[interval],
  }));
const product = await stripe.products.create(
  { name: "InningWise Team Seats" },
  { idempotencyKey: "iw-seat-product" },
);
async function price(interval, nickname) {
  const created = await stripe.prices.create(
    {
      product: product.id,
      currency: "usd",
      nickname,
      recurring: { interval, interval_count: 1, usage_type: "licensed" },
      // Volume tiering: the total quantity picks one rate for every seat.
      // `unit_amount` must be omitted when billing_scheme is tiered.
      billing_scheme: "tiered",
      tiers_mode: "volume",
      tiers: tiers(interval),
    },
    { idempotencyKey: `iw-seat-price-${interval}` },
  );
  if (created.livemode) throw new Error("Refusing a live-mode price.");
  return created;
}
const monthly = await price("month", "Team seats — monthly");
const annual = await price("year", "Team seats — annual");
console.log(`Product: ${product.id}`);
console.log(`STRIPE_TEAM_MONTHLY_PRICE_ID=${monthly.id}`);
console.log(`STRIPE_TEAM_ANNUAL_PRICE_ID=${annual.id}`);
console.log(
  "Set both server-side. Checkout re-verifies the tiers against src/lib/billing/tiers.ts on every session.",
);
