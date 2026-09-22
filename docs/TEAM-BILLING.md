# InningWise team billing foundation

## Scope

One Stripe subscription per team, with all coaches, parents and players included. Monthly and annual Stripe price IDs are configured server-side; no amount or seat count is accepted from the browser. Trial length is configurable and defaults to zero until decided. The player-development games library is a paid app feature gated behind a signed-in member in good standing (see SEATS-AND-GAME-ACCESS.md Decision 2); the public site keeps a limited free sample — the daily drill, capped to one server-selected scenario per day, playable without an account.

This release is test-only. `BILLING_MODE=test` AND an `sk_test_` key are required. Live keys and live webhook events are rejected. With no Stripe configuration, the billing page explains pilot access and checkout remains disabled. Billing enforcement defaults off. Do not turn enforcement on for current pilot teams.

Personal identity applies to billing only in this incremental rollout. Existing shared-passcode game-day access is preserved; this is not yet a replacement for all coach authentication. A passcode, even with the owner role, cannot manage subscriptions. Billing actions require a Supabase-verified email account whose user ID is explicitly assigned to that team. The owner is read again for each action; no user-editable metadata grants ownership.

## Configuration when the owner creates Stripe

1. Create the Stripe account and use its test environment. Create an InningWise Team product with monthly and annual recurring licensed prices after pricing is decided.
2. Set server-only `BILLING_MODE=test`, `STRIPE_SECRET_KEY`, `STRIPE_TEAM_MONTHLY_PRICE_ID`, `STRIPE_TEAM_ANNUAL_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `BILLING_APP_URL` (the active HTTPS app origin), and optionally `BILLING_TRIAL_DAYS` (0–60). Keep `BILLING_ENFORCE` unset/false.
3. Configure the Stripe customer portal in test mode. Permit payment-method updates and cancellation at the end of the billing period. Do not enable quantity changes: this is one subscription per team, not seat billing.
4. Register `/api/billing/webhook` for customer.subscription.created/updated/deleted, invoice.paid/payment_failed and checkout.session.completed/async_payment_succeeded/async_payment_failed. Save the endpoint signing secret server-side. Webhooks use the raw body and verify signatures.
5. Configure Supabase email delivery, email OTP sign-in and rate limits. Use the OTP email template with `{{ .Token }}` rather than the default magic-link-only template. Set `SUPABASE_ANON_KEY` server-side; auth never falls back to the service role. Verify delivery to a real mailbox before inviting owners.
6. Assign the first billing owner from an operator terminal: `node --env-file=<server-env-file> scripts/configure-billing-owner.mjs ORG_ID TEAM_ID EMAIL --complimentary`. For Warriors, use complimentary access. The script creates an unconfirmed auth account if necessary; it does not send email, confirm ownership of the mailbox or replace a different owner. The person requests their own code in the billing page.
7. Test checkout success, declined payment, cancellation, period-end cancellation, renewal failure, webhook retry, owner sign-out and ownership revocation with Stripe test cards. Provider/email end-to-end testing remains pending until the account and delivery are configured. Do not launch real charges merely by setting environment variables; live mode is intentionally unsupported by this release.

## Safety and persistence

- Team foreign keys are scoped by organization. New tables have RLS and no anon/authenticated grants. All writes are server-only.
- Checkout and webhook reconciliation share a three-minute database lease. Customer and checkout creation use Stripe idempotency keys. An uncertain checkout older than 23 hours requires support review instead of risking a duplicate after Stripe expires its idempotency cache.
- Switching billing intervals expires the prior open checkout before creating another. Existing active/incomplete/past-due subscriptions go through the portal instead of creating a second subscription.
- Webhooks read the canonical subscription list while holding the lease; delayed event snapshots cannot restore canceled access. Processed event IDs make duplicates harmless. A failed persistence step returns non-2xx so Stripe retries.
- No card details are stored in InningWise. The billing identity cookie is HttpOnly, SameSite Strict and limited to the billing API path, with at most a one-hour lifetime. Sensitive billing work requires email verification again after expiration. Billing sign-out clears this device's billing cookie; it does not sign out game-day recorders.
- The optional enforcement hook blocks preparing new games only. It never gates active-game commands or historical reads. Broader paid-feature enforcement is a separate launch decision.
- A nightly reconciliation job, full personal-account rollout, owner transfer UI, tax configuration, refunds/disputes and live-mode launch review remain follow-ups.

## Verification

`node --experimental-strip-types --test tests/billing-policy.test.mjs`

`npx tsx --test tests/billing-service.test.mts`

`node --experimental-strip-types --test tests/billing-api.test.mjs`

The service suite requires the disposable `codex-ninety-feet-db-tests` database and local PostgREST at 54390. Apply tests/billing-fixture.sql (minimal local auth schema), then the migration, then notify PostgREST to reload. Existing local review fixtures provide the teams. The API suite uses a local dev server on 4183 with BILLING_MODE=test, STRIPE_SECRET_KEY=sk_test_local_verification and STRIPE_WEBHOOK_SECRET=whsec_local_verification. These are deliberately fake local values, never deployment credentials. Provider orchestration uses a fake Stripe adapter and real disposable Postgres; it is not proof of a real Stripe checkout or email delivery.

## Release checks

The additive migration was applied to the existing production Supabase project. Read-only privilege checks confirm RLS on both tables and no browser-role access to tables or the lease RPC. Security advisors report intentional no-policy notices for these server-only tables; no broad read policies were added to silence them. The pre-existing authenticated current_org_ids SECURITY DEFINER warning remains from the tenancy layer ([advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

15 billing tests passed (4 policy, 7 orchestration/database, 4 API), along with the existing live-game/pitch-rule model checks. TypeScript and production build passed; desktop and 390px billing layout reviewed. No production billing owner, Stripe customer, subscription or charge was created.
