export type BillingState = {
  complimentary: boolean;
  subscription_status: string;
  current_period_end: string | null;
};
export function teamAccess(
  state: BillingState | null,
  enforce: boolean,
  now = Date.now(),
) {
  if (!enforce)
    return {
      canStartGame: true,
      canReadHistory: true,
      canFinishGame: true,
      reason: "pilot",
    };
  const paid =
    !!state &&
    ["active", "trialing"].includes(state.subscription_status) &&
    !!state.current_period_end &&
    Date.parse(state.current_period_end) > now;
  return {
    canStartGame: !!state?.complimentary || paid,
    canReadHistory: true,
    canFinishGame: true,
    reason: state?.complimentary
      ? "complimentary"
      : paid
        ? state!.subscription_status
        : "subscription_required",
  };
}
export function billingMode(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.BILLING_MODE !== "test") return "disabled" as const;
  // This release deliberately cannot accept real payments, even with a live key.
  return env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
    ? ("test" as const)
    : ("disabled" as const);
}
export function validInterval(value: unknown): value is "month" | "year" {
  return value === "month" || value === "year";
}
export function trialDays(value: string | undefined) {
  const n = Number(value || 0);
  if (!Number.isInteger(n) || n < 0 || n > 60)
    throw new Error("Invalid billing trial configuration");
  return n;
}
