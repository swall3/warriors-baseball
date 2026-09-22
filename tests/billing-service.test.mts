import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1).trim()];
    }),
);
assert.equal(env.SUPABASE_URL, "http://127.0.0.1:54390");
Object.assign(process.env, env);
const { activeOwnTeamCount, checkoutForOwner, lease, reconcile, rowFor } =
  await import("../src/lib/billing/server");
const { SEAT_TIERS } = await import("../src/lib/billing/tiers");
const sql = (q: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "codex-ninety-feet-db-tests",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: q, encoding: "utf8" },
  ).trim();
const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.test",
};
const id = "33333333-3333-4333-8333-333333333333";
const reset = () =>
  sql(
    `delete from org_billing where id='${id}' or org_id='org-outlaws';insert into org_billing(id,org_id,owner_user_id) values('${id}','org-outlaws','${owner.id}');`,
  );
process.env.STRIPE_TEAM_MONTHLY_PRICE_ID = "price_month";
process.env.STRIPE_TEAM_ANNUAL_PRICE_ID = "price_year";
process.env.BILLING_APP_URL = "http://localhost:4183";
// Mirrors the reviewed tier table, so the defensive assertion in checkout has
// something real to compare against.
const fakeTiers = (interval: "month" | "year") =>
  SEAT_TIERS.map((t) => ({
    up_to: t.upTo,
    unit_amount: t[interval],
    flat_amount: null,
    flat_amount_decimal: null,
  }));
function fakeStripe(priceOverride: (p: any) => any = (p) => p) {
  let count = 0;
  let subs: any[] = [];
  let expanded: string[][] = [];
  const sessions = new Map<string, any>();
  const keys = new Map<string, any>();
  const stripe = {
    customers: { create: async () => ({ id: "cus_test" }) },
    prices: {
      retrieve: async (id: string, options?: any) => {
        expanded.push(options?.expand ?? []);
        const interval = id === "price_month" ? "month" : "year";
        return priceOverride({
          id,
          livemode: false,
          active: true,
          recurring: { interval, interval_count: 1 },
          billing_scheme: "tiered",
          tiers_mode: "volume",
          // Stripe omits tiers unless they were expanded.
          tiers: options?.expand?.includes("tiers")
            ? fakeTiers(interval)
            : undefined,
        });
      },
    },
    subscriptions: { list: async () => ({ data: subs, has_more: false }) },
    checkout: {
      sessions: {
        create: async (params: any, options: any) => {
          if (keys.has(options.idempotencyKey))
            return keys.get(options.idempotencyKey);
          count++;
          const s = {
            id: `cs_${count}`,
            url: `https://checkout.stripe.com/test_${count}`,
            status: "open",
            params,
          };
          keys.set(options.idempotencyKey, s);
          sessions.set(s.id, s);
          return s;
        },
        retrieve: async (id: string) => sessions.get(id),
        expire: async (id: string) => {
          const s = sessions.get(id);
          s.status = "expired";
          return s;
        },
      },
    },
  };
  return {
    stripe: stripe as any,
    get count() {
      return count;
    },
    sessions,
    keys,
    get expanded() {
      return expanded;
    },
    setSubs: (value: any[]) => {
      subs = value;
    },
  };
}
test("checkout serializes concurrent attempts and reuses the existing session", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  const results = await Promise.allSettled([
    checkoutForOwner(row, owner, "month", 5, fake.stripe),
    checkoutForOwner(row, owner, "month", 5, fake.stripe),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(fake.count, 1);
  assert.equal(
    await checkoutForOwner(row, owner, "month", 5, fake.stripe),
    "https://checkout.stripe.com/test_1",
  );
  assert.equal(fake.count, 1);
  await checkoutForOwner(row, owner, "year", 5, fake.stripe);
  assert.equal(fake.sessions.get("cs_1").status, "expired");
  assert.equal(fake.count, 2);
});
test("unconfirmed checkout persistence retries with the same Stripe idempotency key", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", 5, fake.stripe);
  sql(`update org_billing set checkout_session_id=null where id='${id}'`);
  await checkoutForOwner(row, owner, "month", 5, fake.stripe);
  assert.equal(fake.count, 1);
  sql(
    `update org_billing set checkout_session_id=null,checkout_started_at=now()-interval '25 hours' where id='${id}'`,
  );
  await assert.rejects(
    checkoutForOwner(row, owner, "month", 5, fake.stripe),
    /support review/,
  );
  assert.equal(fake.count, 1);
});
test("wrong billing identity and complimentary access cannot start checkout", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await assert.rejects(
    checkoutForOwner(
      row,
      { id: "22222222-2222-4222-8222-222222222222" },
      "month",
      5,
      fake.stripe,
    ),
    /ownership changed/,
  );
  sql(`update org_billing set complimentary=true where id='${id}'`);
  await assert.rejects(
    checkoutForOwner(row, owner, "month", 5, fake.stripe),
    /complimentary/,
  );
  assert.equal(fake.count, 0);
});
test("canonical subscription state prevents stale events and duplicate subscriptions", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", 5, fake.stripe);
  const sub = {
    id: "sub_test",
    metadata: { inningwise_billing_id: id },
    status: "active",
    created: 1,
    items: { data: [{ current_period_end: 1893456000 }] },
    cancel_at_period_end: false,
    trial_start: null,
  };
  fake.setSubs([sub]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  assert.equal((await rowFor("org-outlaws"))?.subscription_status, "active");
  await assert.rejects(
    checkoutForOwner(row, owner, "month", 5, fake.stripe),
    /already has a subscription/,
  );
  fake.setSubs([{ ...sub, status: "canceled", cancel_at_period_end: false }]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  // Simulate an old event arriving: reconciliation re-reads the canceled canonical state.
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  assert.equal((await rowFor("org-outlaws"))?.subscription_status, "canceled");
  assert.equal(fake.count, 1);
});
test("failed work releases its lease, but an active lease cannot be stolen", async () => {
  reset();
  await assert.rejects(
    lease(id, async () => {
      throw new Error("provider timeout");
    }),
    /provider timeout/,
  );
  await lease(id, async () => {});
  sql(
    `update org_billing set lock_token=gen_random_uuid(),lock_until=now()+interval '1 minute' where id='${id}'`,
  );
  await assert.rejects(
    lease(id, async () => {}),
    /in progress/,
  );
  sql(
    `update org_billing set lock_until=now()-interval '1 second' where id='${id}'`,
  );
  await lease(id, async () => {});
});
test("billing tables and lease RPC are inaccessible to public browser roles", () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(
      sql(
        `select has_table_privilege('${role}','org_billing','select') or has_table_privilege('${role}','org_billing','update');`,
      ),
      "f",
    );
    assert.equal(
      sql(
        `select has_table_privilege('${role}','billing_webhook_events','insert');`,
      ),
      "f",
    );
    assert.equal(
      sql(
        `select has_function_privilege('${role}','acquire_org_billing_lease(uuid,uuid)','execute');`,
      ),
      "f",
    );
  }
  assert.equal(
    sql(
      "select relrowsecurity from pg_class where oid='org_billing'::regclass;",
    ),
    "t",
  );
});

test("canceled organizations can resubscribe without receiving a second trial", async () => {
  reset();
  process.env.BILLING_TRIAL_DAYS = "14";
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", 5, fake.stripe);
  assert.equal(
    fake.sessions.get("cs_1").params.subscription_data.trial_period_days,
    14,
  );
  fake.sessions.get("cs_1").status = "complete";
  fake.sessions.get("cs_1").subscription = "sub_previous";
  fake.setSubs([
    {
      id: "sub_previous",
      metadata: { inningwise_billing_id: id },
      status: "canceled",
      created: 1,
      items: { data: [{ current_period_end: 1893456000 }] },
      cancel_at_period_end: false,
      trial_start: 1700000000,
    },
  ]);
  await checkoutForOwner(row, owner, "year", 5, fake.stripe);
  assert.equal(fake.count, 2);
  assert.equal(
    fake.sessions.get("cs_2").params.subscription_data.trial_period_days,
    undefined,
  );
  delete process.env.BILLING_TRIAL_DAYS;
});

test("checkout buys the requested quantity and refuses an unreviewed price shape", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "year", 12, fake.stripe);
  const line = fake.sessions.get("cs_1").params.line_items[0];
  assert.equal(line.quantity, 12);
  assert.equal(line.price, "price_year");
  // Stripe's own selector is never offered: a decrease has to name teams.
  assert.equal("adjustable_quantity" in line, false);
  assert.equal((await rowFor("org-outlaws"))?.checkout_seats, 12);
  // tiers are omitted unless expanded, so the expand is load-bearing.
  assert.deepEqual(fake.expanded.at(-1), ["tiers"]);

  reset();
  const perUnit = fakeStripe((p) => ({
    ...p,
    billing_scheme: "per_unit",
    tiers_mode: null,
    tiers: undefined,
    unit_amount: 9900,
  }));
  await assert.rejects(
    checkoutForOwner(row, owner, "year", 12, perUnit.stripe),
    /needs configuration/,
  );
  assert.equal(perUnit.count, 0);

  reset();
  const graduated = fakeStripe((p) => ({ ...p, tiers_mode: "graduated" }));
  await assert.rejects(
    checkoutForOwner(row, owner, "year", 12, graduated.stripe),
    /needs configuration/,
  );
  assert.equal(graduated.count, 0);

  reset();
  const drifted = fakeStripe((p) => ({
    ...p,
    tiers: p.tiers?.map((t: any, i: number) =>
      i === 0 ? { ...t, unit_amount: 8900 } : t,
    ),
  }));
  await assert.rejects(
    checkoutForOwner(row, owner, "year", 12, drifted.stripe),
    /needs configuration/,
  );
  assert.equal(drifted.count, 0);

  reset();
  const flat = fakeStripe((p) => ({
    ...p,
    tiers: p.tiers?.map((t: any, i: number) =>
      i === 0 ? { ...t, flat_amount: 5000 } : t,
    ),
  }));
  await assert.rejects(
    checkoutForOwner(row, owner, "year", 12, flat.stripe),
    /needs configuration/,
  );
  assert.equal(flat.count, 0);
});

test("invalid seat counts and seats below the active own-team count never reach Stripe", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  // Opponent teams are scouting records and must not consume a seat.
  assert.equal(await activeOwnTeamCount("org-outlaws"), 1);
  for (const bad of [0, -1, 1.5, 501, "10", null, undefined, NaN])
    await assert.rejects(
      checkoutForOwner(row, owner, "year", bad as any, fake.stripe),
      /whole number of team seats/,
    );
  sql(
    `insert into teams(id,org_id,name,kind) values ('seat-t1','org-outlaws','Seat Test 1','own'),('seat-t2','org-outlaws','Seat Test 2','own'),('seat-t3','org-outlaws','Seat Test 3','own');`,
  );
  try {
    assert.equal(await activeOwnTeamCount("org-outlaws"), 4);
    await assert.rejects(
      checkoutForOwner(row, owner, "year", 3, fake.stripe),
      /at least 4 seats/,
    );
    // Nothing was created: no customer, no attempt, no session.
    assert.equal(fake.count, 0);
    assert.equal((await rowFor("org-outlaws"))?.stripe_customer_id, null);
    assert.equal((await rowFor("org-outlaws"))?.checkout_attempt, null);
    // A read-only team releases its seat.
    sql(`update teams set seat_state='read_only' where id='seat-t3';`);
    assert.equal(await activeOwnTeamCount("org-outlaws"), 3);
    await checkoutForOwner(row, owner, "year", 3, fake.stripe);
    assert.equal(fake.count, 1);
  } finally {
    sql(`delete from teams where id in ('seat-t1','seat-t2','seat-t3');`);
  }
});

test("a different interval or a different seat count expires and recreates the session", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", 5, fake.stripe);
  // Identical request reuses the open session and makes no second Stripe call.
  assert.equal(
    await checkoutForOwner(row, owner, "month", 5, fake.stripe),
    "https://checkout.stripe.com/test_1",
  );
  assert.equal(fake.count, 1);
  // Same interval, more seats: the stale quantity must not be reused.
  await checkoutForOwner(row, owner, "month", 12, fake.stripe);
  assert.equal(fake.sessions.get("cs_1").status, "expired");
  assert.equal(fake.count, 2);
  assert.equal(fake.sessions.get("cs_2").params.line_items[0].quantity, 12);
  // Interval switch at the same seat count also recreates.
  await checkoutForOwner(row, owner, "year", 12, fake.stripe);
  assert.equal(fake.sessions.get("cs_2").status, "expired");
  assert.equal(fake.count, 3);
  // An attempt whose session vanished cannot be resumed at a new seat count:
  // the idempotency key is already bound to the original quantity.
  sql(`update org_billing set checkout_session_id=null where id='${id}'`);
  await assert.rejects(
    checkoutForOwner(row, owner, "year", 20, fake.stripe),
    /Retry the original billing interval and seat count/,
  );
  assert.equal(fake.count, 3);
  await checkoutForOwner(row, owner, "year", 12, fake.stripe);
  assert.equal(fake.count, 3);
});

test("reconciliation persists the canonical seat count and interval, never for complimentary orgs", async () => {
  reset();
  sql(`update org_billing set stripe_customer_id='cus_test' where id='${id}'`);
  const fake = fakeStripe();
  const item = (quantity: number, interval: string) => ({
    id: "si_test",
    quantity,
    current_period_end: 1893456000,
    price: { recurring: { interval, usage_type: "licensed" } },
  });
  const sub = {
    id: "sub_seats",
    metadata: { inningwise_billing_id: id },
    status: "active",
    created: 1,
    items: { data: [item(12, "year")] },
    cancel_at_period_end: false,
    trial_start: null,
  };
  fake.setSubs([sub]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  let saved = (await rowFor("org-outlaws"))!;
  assert.equal(saved.seats, 12);
  assert.equal(saved.billing_interval, "year");

  // A metered add-on is not seats; the licensed item is the seat item.
  fake.setSubs([
    {
      ...sub,
      items: {
        data: [
          {
            id: "si_metered",
            quantity: 999,
            current_period_end: 1893456000,
            price: { recurring: { interval: "year", usage_type: "metered" } },
          },
          item(20, "year"),
        ],
      },
    },
  ]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  assert.equal((await rowFor("org-outlaws"))?.seats, 20);

  // Cancellation retains the last known seat count: access is keyed off status.
  fake.setSubs([
    { ...sub, status: "canceled", items: { data: [item(0, "year")] } },
  ]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  saved = (await rowFor("org-outlaws"))!;
  assert.equal(saved.subscription_status, "canceled");
  assert.equal(saved.seats, 20);

  // Stripe never overwrites an operator-granted complimentary seat count.
  sql(`update org_billing set complimentary=true,seats=99 where id='${id}'`);
  fake.setSubs([{ ...sub, items: { data: [item(2, "month")] } }]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  saved = (await rowFor("org-outlaws"))!;
  assert.equal(saved.seats, 99);
  assert.equal(saved.billing_interval, "month");
});
