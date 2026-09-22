import { billingScope } from "@/lib/billing/server";
import { billingMode, teamAccess } from "@/lib/billing/policy";
import { failure, reply } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const { row, user } = await billingScope(request);
    const owner = !!row && !!user && row.owner_user_id === user.id;
    return reply({
      mode: billingMode(),
      ownerConfigured: !!row?.owner_user_id,
      isBillingOwner: owner,
      email: user?.email ?? null,
      status: row?.subscription_status ?? "none",
      complimentary: row?.complimentary ?? false,
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
