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
const { checkoutForOwner, lease, reconcile, rowFor } =
  await import("../src/lib/billing/server");
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
function fakeStripe() {
  let count = 0;
  let subs: any[] = [];
  const sessions = new Map<string, any>();
  const keys = new Map<string, any>();
  const stripe = {
    customers: { create: async () => ({ id: "cus_test" }) },
    prices: {
      retrieve: async (id: string) => ({
        id,
        livemode: false,
        active: true,
        recurring: {
          interval: id === "price_month" ? "month" : "year",
          interval_count: 1,
        },
      }),
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
    checkoutForOwner(row, owner, "month", fake.stripe),
    checkoutForOwner(row, owner, "month", fake.stripe),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(fake.count, 1);
  assert.equal(
    await checkoutForOwner(row, owner, "month", fake.stripe),
    "https://checkout.stripe.com/test_1",
  );
  assert.equal(fake.count, 1);
  await checkoutForOwner(row, owner, "year", fake.stripe);
  assert.equal(fake.sessions.get("cs_1").status, "expired");
  assert.equal(fake.count, 2);
});
test("unconfirmed checkout persistence retries with the same Stripe idempotency key", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", fake.stripe);
  sql(`update org_billing set checkout_session_id=null where id='${id}'`);
  await checkoutForOwner(row, owner, "month", fake.stripe);
  assert.equal(fake.count, 1);
  sql(
    `update org_billing set checkout_session_id=null,checkout_started_at=now()-interval '25 hours' where id='${id}'`,
  );
  await assert.rejects(
    checkoutForOwner(row, owner, "month", fake.stripe),
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
      fake.stripe,
    ),
    /ownership changed/,
  );
  sql(`update org_billing set complimentary=true where id='${id}'`);
  await assert.rejects(
    checkoutForOwner(row, owner, "month", fake.stripe),
    /complimentary/,
  );
  assert.equal(fake.count, 0);
});
test("canonical subscription state prevents stale events and duplicate subscriptions", async () => {
  reset();
  const fake = fakeStripe();
  const row = (await rowFor("org-outlaws"))!;
  await checkoutForOwner(row, owner, "month", fake.stripe);
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
  assert.equal(
    (await rowFor("org-outlaws"))?.subscription_status,
    "active",
  );
  await assert.rejects(
    checkoutForOwner(row, owner, "month", fake.stripe),
    /already has a subscription/,
  );
  fake.setSubs([{ ...sub, status: "canceled", cancel_at_period_end: false }]);
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  // Simulate an old event arriving: reconciliation re-reads the canceled canonical state.
  await lease(id, (fresh, token) => reconcile(fresh, token, fake.stripe));
  assert.equal(
    (await rowFor("org-outlaws"))?.subscription_status,
    "canceled",
  );
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
  await checkoutForOwner(row, owner, "month", fake.stripe);
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
  await checkoutForOwner(row, owner, "year", fake.stripe);
  assert.equal(fake.count, 2);
  assert.equal(
    fake.sessions.get("cs_2").params.subscription_data.trial_period_days,
    undefined,
  );
  delete process.env.BILLING_TRIAL_DAYS;
});
