# Team notification emails

Resend SMTP supplies Supabase sign-in codes. App notices use a separate sending-only key scoped to mail.inningwise.com. Server-only production variables are RESEND_API_KEY and EMAIL_FROM; BILLING_APP_URL supplies trusted links. Never accept a recipient or message body from the browser.

Verified owners manage opt-in categories and send a rate-limited self-test under Team billing → Team email notifications. All categories default off. Signing out or losing team ownership prevents settings access; deliveries recheck current ownership, organization activation, email verification and preferences. Changing the email cancels an already prepared request instead of silently changing its recipient.

Database triggers queue notices atomically when a shared game is prepared, its date/opponent changes while ready, it becomes final, a practice is assigned, or a subscription status/cancellation flag changes. Legacy imported games and per-pitch updates do not generate email. No player names, private notes or recorder credentials go into notification messages.

The additive migration must precede app deployment. Tables have RLS and no browser-role access; functions are security invoker and service-role only. Preferences belong to a specific org/team/verified owner, with defaults off for replacement owners.

After successful API writes, Next after() drains up to three queued notices without delaying or invalidating the saved action. Delivery leases prevent concurrent sends. Failed requests keep a frozen payload and stable Resend idempotency key, with backoff and at most five attempts. Ambiguous attempts older than 23 hours require provider review rather than a resend after the 24-hour provider dedupe window. Retries run on subsequent team mutations or the verified owner's Retry queued emails button; this release does not promise a scheduled background retry when the app is idle.

Accepted means provider acceptance, not inbox delivery. Resend's dashboard is the source of delivery/bounce/suppression truth; no unverified delivery webhook is installed. Resend suppressions remain respected. The owner can disable categories in the app; queued notices are skipped. An already in-flight email can arrive after opt-out. This is transactional, opt-in owner email, not a parent broadcast or marketing list.

## Verification

- `npx tsx --test tests/notifications.test.mts tests/notifications-service.test.mts tests/notifications-api.test.mts`
- `tests/notifications-database.sql` runs transactionally and rolls back in the disposable codex-ninety-feet-db-tests database; do not run fixtures against production.
- Service/API tests assert the disposable local Supabase URL; they mock the mail provider, use real Postgres, and test concurrent leases, stable retry payloads, opt-out, ownership changes, unauthorized roles and cross-tenant access.
- Production sign-in delivery confirmed in Resend on 2026-09-22. App notification delivery is verified separately with the owner's Send me a test email control after deployment.

Production security advisors found no new warning-level issue from these objects. No-policy informational notices are intentional for server-only tables with browser grants revoked. Existing findings remain for [current_org_ids SECURITY DEFINER access](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password leak protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); neither setting was changed by this feature.
