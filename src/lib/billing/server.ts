import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { canReadTeam } from "@/lib/access/policy";
import { IDENTITY_COOKIE } from "@/lib/access/identity";
import { cookies } from "next/headers";
import { client, LiveError } from "@/lib/coach/live/store";
import { sessionFor } from "@/lib/coach/live/http";
import { billingMode, teamAccess, trialDays, validInterval } from "./policy";
export const ACCOUNT_COOKIE = "iw_billing_identity";
// One billing row per organization. Teams inherit their organization's subscription.
export type BillingRow = {
  id: string;
  org_id: string;
  owner_user_id: string | null;
  complimentary: boolean;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_used: boolean;
  checkout_attempt: string | null;
  checkout_started_at: string | null;
  checkout_interval: "month" | "year" | null;
  checkout_price_id: string | null;
  checkout_session_id: string | null;
};
export function stripeClient() {
  if (billingMode() !== "test")
    throw new LiveError("Payment testing is not configured yet.", 503);
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    timeout: 20000,
    maxNetworkRetries: 1,
  });
}
export function authClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)
    throw new LiveError("Email sign-in is not configured yet.", 503);
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
export async function billingUser() {
  const jar = await cookies();
  const token =
    jar.get(IDENTITY_COOKIE)?.value ?? jar.get(ACCOUNT_COOKIE)?.value;
  if (!token) return null;
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user?.email_confirmed_at || data.user.is_anonymous)
    return null;
  return data.user;
}
export function checked(error: { message: string } | null) {
  if (error)
    throw new LiveError(
      "Billing storage is unavailable. Please retry shortly.",
      503,
    );
}
export async function rowFor(orgId: string) {
  const { data, error } = await client()
    .from("org_billing")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  checked(error);
  return data as BillingRow | null;
}
export async function billingScope(
  request: Request,
  mutation = false,
  owner = false,
) {
  const session = await sessionFor(request, mutation);
  const org = await client()
    .from("organizations")
    .select("active")
    .eq("id", session.orgId)
    .single();
  checked(org.error);
  if (!org.data?.active) throw new LiveError("Organization unavailable.", 403);
  const row = await rowFor(session.orgId);
  const user = await billingUser();
  if (owner && (!row || !user || row.owner_user_id !== user.id))
    throw new LiveError(
      "Only this organization’s verified billing owner can manage payments.",
      403,
    );
  return { session, row, user };
}
// Notification preferences stay per team, so that surface still resolves a team
// inside the session's organization before the organization-wide owner check.
export async function teamScope(
  request: Request,
  teamId: unknown,
  mutation = false,
  owner = false,
) {
  const scope = await billingScope(request, mutation, false);
  if (typeof teamId !== "string" || !teamId || teamId.length > 150)
    throw new LiveError("Choose a team.", 400);
  if (!canReadTeam(scope.session, teamId))
    throw new LiveError("Team access unavailable.", 403);
  const { data, error } = await client()
    .from("teams")
    .select("id,name")
    .eq("org_id", scope.session.orgId)
    .eq("id", teamId)
    .eq("kind", "own")
    .maybeSingle();
  checked(error);
  if (!data) throw new LiveError("Team not found.", 404);
  if (
    owner &&
    (!scope.row || !scope.user || scope.row.owner_user_id !== scope.user.id)
  )
    throw new LiveError(
      "Only this organization’s verified billing owner can manage payments.",
      403,
    );
  return { ...scope, team: data };
}
export async function lease<T>(
  id: string,
  work: (row: BillingRow, token: string) => Promise<T>,
): Promise<T> {
  const token = randomUUID();
  const acquired = await client().rpc("acquire_org_billing_lease", {
    p_id: id,
    p_token: token,
  });
  checked(acquired.error);
  if (!acquired.data)
    throw new LiveError(
      "Another billing update is in progress. Try again shortly.",
      409,
    );
  try {
    const result = await client()
      .from("org_billing")
      .select("*")
      .eq("id", id)
      .single();
    checked(result.error);
    return await work(result.data as BillingRow, token);
  } finally {
    await client()
      .from("org_billing")
      .update({ lock_token: null, lock_until: null })
      .eq("id", id)
      .eq("lock_token", token);
  }
}
export async function save(
  row: BillingRow,
  token: string,
  patch: Partial<BillingRow>,
) {
  const result = await client()
    .from("org_billing")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("lock_token", token)
    .gt("lock_until", new Date().toISOString())
    .select("id");
  checked(result.error);
  if (result.data?.length !== 1)
    throw new LiveError("Billing update expired. Retry shortly.", 409);
  Object.assign(row, patch);
}
function returnUrl() {
  const url = new URL(
    process.env.BILLING_APP_URL || "https://warriors-baseball-omega.vercel.app",
  );
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new LiveError("Billing return address is not configured.", 503);
  return url.origin + "/coach/billing";
}
export async function reconcile(
  row: BillingRow,
  token: string,
  stripe: Stripe,
) {
  if (!row.stripe_customer_id) return;
  // Read canonical state, not webhook snapshots: delayed events cannot overwrite newer billing state.
  const list = await stripe.subscriptions.list({
    customer: row.stripe_customer_id,
    status: "all",
    limit: 100,
  });
  if (list.has_more)
    throw new LiveError("Billing history needs support review.", 503);
  const subscriptions = list.data.filter(
    (s) => s.metadata.inningwise_billing_id === row.id,
  );
  const current = subscriptions.filter(
    (s) => !["canceled", "incomplete_expired"].includes(s.status),
  );
  if (current.length > 1)
    throw new LiveError("Multiple subscriptions need support review.", 409);
  const sub =
    current[0] || subscriptions.sort((a, b) => b.created - a.created)[0];
  if (!sub) return;
  const ends = sub.items.data
    .map((item) => item.current_period_end)
    .filter(Number.isFinite);
  await save(row, token, {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    current_period_end: ends.length
      ? new Date(Math.min(...ends) * 1000).toISOString()
      : null,
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_used: row.trial_used || !!sub.trial_start,
  });
}
export async function checkout(request: Request, interval: unknown) {
  const scope = await billingScope(request, true, true);
  if (!validInterval(interval))
    throw new LiveError("Choose monthly or annual billing.", 400);
  return checkoutForOwner(scope.row!, scope.user!, interval, stripeClient());
}
// Injectable provider keeps payment orchestration testable without real charges.
export async function checkoutForOwner(
  initial: BillingRow,
  user: { id: string; email?: string },
  interval: "month" | "year",
  stripe: Stripe,
) {
  return lease(initial.id, async (row, token) => {
    // Ownership is rechecked after acquiring the lease, not trusted from the prior read.
    if (row.owner_user_id !== user.id)
      throw new LiveError("Billing ownership changed.", 403);
    if (row.complimentary)
      throw new LiveError(
        "This organization already has complimentary access.",
        409,
      );
    if (!row.stripe_customer_id) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { inningwise_billing_id: row.id } },
        { idempotencyKey: `iw-customer-${row.id}` },
      );
      await save(row, token, { stripe_customer_id: customer.id });
    }
    await reconcile(row, token, stripe);
    if (
      !["none", "canceled", "incomplete_expired"].includes(
        row.subscription_status,
      )
    )
      throw new LiveError(
        "This organization already has a subscription. Use Manage billing.",
        409,
      );
    if (row.checkout_session_id) {
      const previous = await stripe.checkout.sessions.retrieve(
        row.checkout_session_id,
      );
      if (previous.status === "complete") {
        const previousSubscription =
          typeof previous.subscription === "string"
            ? previous.subscription
            : previous.subscription?.id;
        if (
          !previousSubscription ||
          previousSubscription !== row.stripe_subscription_id ||
          !["canceled", "incomplete_expired"].includes(row.subscription_status)
        )
          throw new LiveError(
            "Payment is being confirmed. Refresh shortly.",
            409,
          );
      }
      if (previous.status === "open") {
        if (row.checkout_interval === interval) return previous.url;
        // Expiring the old session first makes an interval change safe against double checkout.
        await stripe.checkout.sessions.expire(previous.id);
      }
      await save(row, token, {
        checkout_attempt: null,
        checkout_session_id: null,
      });
    }
    if (!row.checkout_attempt) {
      const priceId =
        interval === "month"
          ? process.env.STRIPE_TEAM_MONTHLY_PRICE_ID
          : process.env.STRIPE_TEAM_ANNUAL_PRICE_ID;
      if (!priceId)
        throw new LiveError("This billing option is not available yet.", 503);
      const price = await stripe.prices.retrieve(priceId);
      if (
        price.livemode ||
        !price.active ||
        price.recurring?.interval !== interval ||
        price.recurring.interval_count !== 1
      )
        throw new LiveError(
          "The test subscription price needs configuration.",
          503,
        );
      await save(row, token, {
        checkout_attempt: randomUUID(),
        checkout_started_at: new Date().toISOString(),
        checkout_interval: interval,
        checkout_price_id: priceId,
      });
    }
    if (row.checkout_interval !== interval)
      throw new LiveError("Retry the original billing interval.", 409);
    // Stripe idempotency keys last at least 24h. Never recreate an ambiguous older request.
    if (Date.now() - Date.parse(row.checkout_started_at!) > 23 * 3600_000)
      throw new LiveError(
        "An unfinished checkout needs support review before retrying.",
        409,
      );
    const days = trialDays(process.env.BILLING_TRIAL_DAYS);
    const session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: row.stripe_customer_id!,
        client_reference_id: row.id,
        line_items: [{ price: row.checkout_price_id!, quantity: 1 }],
        metadata: { inningwise_billing_id: row.id },
        subscription_data: {
          metadata: { inningwise_billing_id: row.id },
          ...(!row.trial_used && days ? { trial_period_days: days } : {}),
        },
        success_url: `${returnUrl()}?checkout=returned`,
        cancel_url: `${returnUrl()}?checkout=cancelled`,
      },
      { idempotencyKey: `iw-checkout-${row.checkout_attempt}` },
    );
    await save(row, token, { checkout_session_id: session.id });
    return session.url;
  });
}
export async function portal(request: Request) {
  const scope = await billingScope(request, true, true);
  const stripe = stripeClient();
  return lease(scope.row!.id, async (row) => {
    if (row.owner_user_id !== scope.user!.id)
      throw new LiveError("Billing ownership changed.", 403);
    if (!row.stripe_customer_id)
      throw new LiveError("No billing account has been created yet.", 409);
    return (
      await stripe.billingPortal.sessions.create({
        customer: row.stripe_customer_id,
        return_url: returnUrl(),
      })
    ).url;
  });
}
// teamId is retained for the call sites and for the per-team seat checks PR 6 adds;
// subscription state itself is now organization-wide.
export async function assertCanStartGame(orgId: string, _teamId: string) {
  // Enforcement stays off in this release. A future launch must explicitly enable it.
  if (process.env.BILLING_ENFORCE !== "true") return;
  const row = await rowFor(orgId);
  if (!teamAccess(row, true).canStartGame)
    throw new LiveError(
      "Your organization needs an active subscription to prepare a new game. Existing games and history remain available.",
      402,
    );
}
