# InningWise team billing foundation

## Scope

One Stripe subscription per organization. The organization buys one seat per team it runs; every coach, parent and player on a team is included at no extra cost. Monthly and annual Stripe price IDs are configured server-side and no amount is ever accepted from the browser. The browser does propose a seat *quantity*, which the server validates (whole number, 1–500, never below the organization's active own-team count) and which Stripe prices from its own tier table. Trial length is configurable and defaults to zero until decided. The player-development games library is a paid app feature gated behind a signed-in member in good standing (see SEATS-AND-GAME-ACCESS.md Decision 2); the public site keeps a limited free sample — the daily drill, capped to one server-selected scenario per day, playable without an account.

This release is test-only. `BILLING_MODE=test` AND an `sk_test_` key are required. Live keys and live webhook events are rejected. With no Stripe configuration, the billing page explains pilot access and checkout remains disabled. Billing enforcement defaults off. Do not turn enforcement on for current pilot teams.

Personal identity applies to billing only in this incremental rollout. Existing shared-passcode game-day access is preserved; this is not yet a replacement for all coach authentication. A passcode, even with the owner role, cannot manage subscriptions. Billing actions require a Supabase-verified email account whose user ID is explicitly assigned as the organization's billing owner. The owner is read again for each action; no user-editable metadata grants ownership.

## Configuration when the owner creates Stripe

1. Create the Stripe account and use its test environment. Provision the seat product and its two prices with `node --env-file=<server-env-file> scripts/configure-seat-prices.mjs`; it prints both price IDs. The script refuses to run outside `BILLING_MODE=test` with an `sk_test_` key.
2. Set server-only `BILLING_MODE=test`, `STRIPE_SECRET_KEY`, `STRIPE_TEAM_MONTHLY_PRICE_ID`, `STRIPE_TEAM_ANNUAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `BILLING_APP_URL` (the active HTTPS app origin), and optionally `BILLING_TRIAL_DAYS` (0–60). Keep `BILLING_ENFORCE` unset/false.
3. Configure the Stripe customer portal in test mode. Permit payment-method updates and cancellation at the end of the billing period. Do not enable quantity changes. Seat decreases require deciding which teams become read-only, and the portal cannot ask that question; seat changes stay in the app.
4. Register `/api/billing/webhook` for customer.subscription.created/updated/deleted, invoice.paid/payment_failed and checkout.session.completed/async_payment_succeeded/async_payment_failed. Save the endpoint signing secret server-side. Webhooks use the raw body and verify signatures.
5. Configure Supabase email delivery, email OTP sign-in and rate limits. Use the OTP email template with `{{ .Token }}` rather than the default magic-link-only template. Set `SUPABASE_ANON_KEY` server-side; auth never falls back to the service role. Verify delivery to a real mailbox before inviting owners.
6. Assign the first billing owner from an operator terminal: `node --env-file=<server-env-file> scripts/configure-billing-owner.mjs ORG_ID EMAIL --complimentary [--seats N]`. For Warriors, use complimentary access. The script creates an unconfirmed auth account if necessary; it does not send email, confirm ownership of the mailbox or replace a different owner. The person requests their own code in the billing page.
7. Test checkout success, declined payment, cancellation, period-end cancellation, renewal failure, webhook retry, owner sign-out and ownership revocation with Stripe test cards. Provider/email end-to-end testing remains pending until the account and delivery are configured. Do not launch real charges merely by setting environment variables; live mode is intentionally unsupported by this release.

## Safety and persistence

- The billing row is `public.org_billing`, one per organization, with RLS and no anon/authenticated grants. All writes are server-only. Team foreign keys remain scoped by organization.
- Checkout and webhook reconciliation share a three-minute database lease. Customer and checkout creation use Stripe idempotency keys. An uncertain checkout older than 23 hours requires support review instead of risking a duplicate after Stripe expires its idempotency cache.
- Switching billing intervals expires the prior open checkout before creating another. Existing active/incomplete/past-due subscriptions go through the portal instead of creating a second subscription for the organization.
- Webhooks read the canonical subscription list while holding the lease; delayed event snapshots cannot restore canceled access. Processed event IDs make duplicates harmless. A failed persistence step returns non-2xx so Stripe retries.
- No card details are stored in InningWise. The billing identity cookie is HttpOnly, SameSite Strict and limited to the billing API path, with at most a one-hour lifetime. Sensitive billing work requires email verification again after expiration. Billing sign-out clears this device's billing cookie; it does not sign out game-day recorders.
- Email notifications resolve their single recipient from `org_members` (role `owner`); the outbox stays per team, so an organization billing change fans out one row per own team. The optional enforcement hook blocks preparing new games only. It never gates active-game commands or historical reads. Broader paid-feature enforcement is a separate launch decision.
- A nightly reconciliation job, full personal-account rollout, owner transfer UI, tax configuration, refunds/disputes and live-mode launch review remain follow-ups.

## Verification

`node --experimental-strip-types --test tests/billing-policy.test.mjs`

`npx tsx --test tests/billing-service.test.mts`

`node --experimental-strip-types --test tests/billing-api.test.mjs`

The service suite requires the disposable `codex-ninety-feet-db-tests` database and local PostgREST at 54390. The API suite's base URL can be overridden with `BILLING_API_BASE` when port 4183 is already in use. Apply tests/billing-fixture.sql (minimal local auth schema), then the migration, then notify PostgREST to reload. Existing local review fixtures provide the teams. The API suite uses a local dev server on 4183 with BILLING_MODE=test, STRIPE_SECRET_KEY=sk_test_local_verification and STRIPE_WEBHOOK_SECRET=whsec_local_verification. These are deliberately fake local values, never deployment credentials. Provider orchestration uses a fake Stripe adapter and real disposable Postgres; it is not proof of a real Stripe checkout or email delivery.

## Release checks

The additive migration was applied to the existing production Supabase project. Read-only privilege checks confirm RLS on both tables and no browser-role access to tables or the lease RPC. Security advisors report intentional no-policy notices for these server-only tables; no broad read policies were added to silence them. The pre-existing authenticated current_org_ids SECURITY DEFINER warning remains from the tenancy layer ([advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

22 billing tests passed (7 policy, 11 orchestration/database, 4 API), along with the existing live-game/pitch-rule model checks. TypeScript and production build passed; desktop and 390px billing layout reviewed. No production billing owner, Stripe customer, subscription or charge was created.

## Organization scope (2026-09-22)

Billing moved from one row per team to one row per organization (`public.org_billing`), per `ORG-SEAT-BILLING-PLAN.md` §1.5, §2.7, §4. `acquire_org_billing_lease` replaces `acquire_billing_lease` for the new row; the three-minute lease, idempotency keys, 23-hour ambiguous-checkout rule, processed-event dedupe, test-mode-only guard, complimentary handling and `BILLING_ENFORCE`-off default are all unchanged. Seat enforcement remains a later, separate change.

`queue_team_notification` keeps its signature but resolves the owner from `org_members` instead of `team_billing`, and the billing trigger moved to `org_billing` with a per-team fanout. `team_billing` and `acquire_billing_lease` still exist and are dropped in a later change once the organization scope has soaked.

## Seat pricing (2026-09-22)

Seats are priced with two Stripe **tiered / volume** prices on one product, provisioned by `scripts/configure-seat-prices.mjs`. Volume tiering means the total seat quantity selects one rate that applies to every seat, so crossing a boundary re-rates the whole subscription.

| Seats | Per seat / year | Per seat / month |
|---|---|---|
| 1–9 | $99.00 | $10.00 |
| 10–19 | $80.00 | $8.00 |
| 20+ | $70.00 | $7.00 |

Cap: 500 seats. The same table lives in `src/lib/billing/tiers.ts` and is used for exactly three things — provisioning the Stripe prices, rendering the checkout estimate, and asserting on every checkout that the configured Stripe price has not drifted from the reviewed amounts. It **never** computes a charge: Stripe is the sole authority on money, and the billing page labels its figure as an estimate.

Because the tiers re-rate every seat, the totals are deliberately non-monotonic at each boundary: 9 seats/year is $891 while 10 is $800, and 19 is $1,520 while 20 is $1,400. That is the pricing decision of record and is asserted in `tests/billing-policy.test.mjs`.

Checkout requests the seat quantity in `line_items[0].quantity`. `adjustable_quantity` is deliberately **not** enabled: a seat decrease has to decide which teams become read-only, which Stripe's selector cannot ask (and it caps at 99). The seat count is persisted as `org_billing.checkout_seats`, and the re-entrancy rule now covers both fields — a different interval *or* a different seat count expires the open session and creates a new one, while an identical request reuses the existing URL. Reconciliation writes `seats` and `billing_interval` back from the canonical subscription item, never for a complimentary organization, and retains the last known seat count when a subscription is canceled or expires.

Stripe prices are immutable. A future tier change means a new price plus a subscription migration, not an edit to this table.

The tier assertion is type-checked against `stripe@22.6.2` and covered by the fake provider, but `prices.retrieve(id, {expand:['tiers']})` has not been exercised against a real test-mode Stripe account yet (`ORG-SEAT-BILLING-PLAN.md` §7 lists it as verify-before-relying-on). It fails closed: if the expand returned no tiers, `tiersMatch` is false and checkout 503s rather than selling at an unverified rate. Confirm it when the Stripe test account is wired up.

Self-serve seat changes are not in this release: an organization that needs a different seat count contacts support.
