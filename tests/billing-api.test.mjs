import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { signSession } from "../src/lib/coach/session.ts";
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
const base = process.env.BILLING_API_BASE ?? "http://localhost:4183";
const cookie = async (org, role) =>
  `ec_coach_session=${await signSession({ orgId: org, role }, env.SESSION_SECRET, 3600)}`;
const owner = await cookie("org-outlaws", "owner");
const viewer = await cookie("org-outlaws", "viewer");
const foreign = await cookie("org-review-talking", "owner");
async function call(
  path,
  { method = "GET", auth = owner, body, origin = base } = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: { cookie: auth, origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
test("every billing endpoint requires a valid team session", async () => {
  for (const [path, method] of [
    ["", "GET"],
    ["/checkout", "POST"],
    ["/portal", "POST"],
    ["/account", "POST"],
    ["/account", "DELETE"],
  ]) {
    const r = await call("/api/coach/billing" + path, {
      method,
      auth: "",
      body: method === "POST" ? {} : undefined,
    });
    assert.equal(r.status, 401);
  }
});
test("billing status is organization-scoped and omits provider IDs and account tokens", async () => {
  const r = await call("/api/coach/billing");
  assert.equal(r.status, 200);
  assert.equal(r.data.isBillingOwner, false);
  assert.equal(r.data.ownerConfigured, true);
  assert.equal(r.data.mode, "test");
  assert.equal("stripe_customer_id" in r.data, false);
  assert.equal("owner_user_id" in r.data, false);
  assert.equal("team" in r.data, false);
  // Another organization reads its own billing, never this one's.
  const other = await call("/api/coach/billing", { auth: foreign });
  assert.equal(other.status, 200);
  assert.equal(other.data.ownerConfigured, false);
  assert.equal(other.data.isBillingOwner, false);
  assert.equal(other.data.status, "none");
  assert.equal(
    (await call("/api/coach/billing", { auth: viewer })).status,
    200,
  );
});
test("shared owner passcodes cannot manage payments, and mutations reject foreign origins", async () => {
  for (const route of ["checkout", "portal"]) {
    assert.equal(
      (
        await call("/api/coach/billing/" + route, {
          method: "POST",
          body: { interval: "month" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/coach/billing/" + route, {
          method: "POST",
          auth: viewer,
          body: { interval: "month" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call("/api/coach/billing/" + route, {
          method: "POST",
          origin: "https://evil.example",
          body: { interval: "month" },
        })
      ).status,
      403,
    );
  }
  assert.equal(
    (
      await call("/api/coach/billing/account", {
        method: "POST",
        origin: "https://evil.example",
        body: { action: "send", email: "a@example.test" },
      })
    ).status,
    403,
  );
});
test("webhooks reject missing, forged and live-mode signatures; valid unrelated events acknowledge", async () => {
  const stripe = new Stripe("sk_test_local_verification");
  async function webhook(payload, signature) {
    const r = await fetch(base + "/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(signature ? { "stripe-signature": signature } : {}),
      },
      body: payload,
    });
    return r.status;
  }
  const payload = JSON.stringify({
    id: "evt_test_ignored",
    type: "customer.created",
    livemode: false,
    data: { object: { id: "cus_fake" } },
  });
  assert.equal(await webhook(payload), 400);
  assert.equal(await webhook(payload, "t=1,v1=forged"), 400);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_local_verification",
  });
  assert.equal(await webhook(payload, signature), 200);
  const live = JSON.stringify({
    id: "evt_live",
    type: "customer.created",
    livemode: true,
    data: { object: {} },
  });
  assert.equal(
    await webhook(
      live,
      stripe.webhooks.generateTestHeaderString({
        payload: live,
        secret: "whsec_local_verification",
      }),
    ),
    400,
  );
});
