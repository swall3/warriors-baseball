import {
  stripeClient,
  lease,
  reconcile,
  checked,
  type BillingRow,
} from "@/lib/billing/server";
import { client } from "@/lib/coach/live/store";
import { failure, reply } from "@/lib/coach/live/http";
export const runtime = "nodejs";
const events = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);
export async function POST(request: Request) {
  try {
    const stripe = stripeClient();
    if (!process.env.STRIPE_WEBHOOK_SECRET)
      return reply({ error: "Webhook is not configured" }, 503);
    if (Number(request.headers.get("content-length") || 0) > 1_000_000)
      return reply({ error: "Payload too large" }, 413);
    const raw = await request.text();
    if (raw.length > 1_000_000)
      return reply({ error: "Payload too large" }, 413);
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        raw,
        request.headers.get("stripe-signature") || "",
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      return reply({ error: "Invalid webhook signature" }, 400);
    }
    if (event.livemode)
      return reply({ error: "Only test events are accepted" }, 400);
    if (!events.has(event.type))
      return reply({ received: true, ignored: true });
    const db = client();
    const seen = await db
      .from("billing_webhook_events")
      .select("event_id")
      .eq("event_id", event.id)
      .maybeSingle();
    checked(seen.error);
    if (seen.data) return reply({ received: true, duplicate: true });
    const object = event.data.object as unknown as {
      customer?: string | { id: string };
      metadata?: Record<string, string>;
    };
    const customer =
      typeof object.customer === "string"
        ? object.customer
        : object.customer?.id;
    if (!customer) return reply({ received: true, ignored: true });
    const lookup = await db
      .from("team_billing")
      .select("*")
      .eq("stripe_customer_id", customer)
      .maybeSingle();
    checked(lookup.error);
    if (!lookup.data) {
      // Our checkout may still be persisting its customer mapping. Ask Stripe to retry.
      if (object.metadata?.inningwise_billing_id)
        return reply({ error: "Customer mapping pending" }, 503);
      return reply({ received: true, ignored: true });
    }
    await lease((lookup.data as BillingRow).id, async (row, token) => {
      await reconcile(row, token, stripe);
      const inserted = await db
        .from("billing_webhook_events")
        .insert({ event_id: event.id, event_type: event.type });
      if (inserted.error?.code !== "23505") checked(inserted.error);
    });
    return reply({ received: true });
  } catch (e) {
    // Non-2xx responses intentionally let Stripe retry transient failures.
    return failure(e);
  }
}
