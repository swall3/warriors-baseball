import { activeOwnTeamCount, billingScope } from "@/lib/billing/server";
import { billingMode, teamAccess } from "@/lib/billing/policy";
import { MAX_SEATS } from "@/lib/billing/tiers";
import { failure, reply } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const { session, row, user } = await billingScope(request);
    const owner = !!row && !!user && row.owner_user_id === user.id;
    // The seat floor is computed server-side; the browser never decides it.
    const activeTeams = await activeOwnTeamCount(session.orgId);
    return reply({
      mode: billingMode(),
      ownerConfigured: !!row?.owner_user_id,
      isBillingOwner: owner,
      email: user?.email ?? null,
      status: row?.subscription_status ?? "none",
      complimentary: row?.complimentary ?? false,
      seats: row?.seats ?? 0,
      billingInterval: row?.billing_interval ?? null,
      activeTeams,
      maxSeats: MAX_SEATS,
      currentPeriodEnd: row?.current_period_end ?? null,
      cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
      hasCustomer: owner && !!row?.stripe_customer_id,
      monthlyAvailable: !!process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
      annualAvailable: !!process.env.STRIPE_TEAM_ANNUAL_PRICE_ID,
      access: teamAccess(row, process.env.BILLING_ENFORCE === "true"),
    });
  } catch (e) {
    return failure(e);
  }
}
