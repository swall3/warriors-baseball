# Organization and team access

Organizations retain their teams and history when staff leave. Named, verified accounts replace shared passcodes when account access is enabled.

Roles: organization owner, organization manager, team head coach, assistant coach, and parent. Team management and billing ownership are separate.

## Workflows

- `/account`: verified email sign-in, refresh, organization selection, invitation acceptance, and sign-out. Supabase authenticates people; database memberships authorize every request. Authorization never uses editable user metadata.
- `/coach/access`: create teams, invite managers/coaches/parents, revoke invitations, promote a parent to assistant coach, replace a head coach, remove access, and transfer organization ownership.
- `/coach/family`: parents see their teams' game summaries and only their linked children's practice. A separate game-specific recorder link permits its assigned lane for that team; it does not grant staff-management rights.
- Invite a replacement as an assistant first. Once they accept, select **Make head coach**. The previous head coach's team membership is removed. Organization owners/managers retain their organization role until separately removed.
- Organization ownership may be transferred only to an existing manager. The outgoing owner remains a manager, and can then be removed by the new owner. No action can remove the current owner outright.
- Head coaches may invite assistants and parents. Assistant coaches may invite/remove parents. Organization managers may assign staff across all organization teams. Only owners may appoint managers or transfer organization ownership.
- New teams inherit the organization owner's billing responsibility, without creating a subscription or payment. Staff changes never move existing Stripe customers or payment methods.

## Rollout and compatibility

The migration bootstraps an owner from existing verified billing ownership only when an organization has exactly one distinct billing owner. It does not infer an owner from a passcode or turn arbitrary memberships into administrators.

**Enable individual accounts** retires all existing shared-passcode access for that organization. Invitations cannot be issued before this switch. The owner must sign in by email and enable it when ready to invite the existing staff. Database outages fail closed. Old passcode login gives a clear email-sign-in message after activation.

Historical imports do not contain an own-team identifier. They remain organization-manager-only until explicitly classified; team coaches receive their shared live-game reports and analytics. No records are deleted or guessed into a team. Legacy device data is preserved, and live-game caches for individual accounts use a user-specific namespace.

## Security and delivery

- Expiring, single-use invitations store only SHA-256 token hashes, bind acceptance to a verified email, and recheck the inviter's current role.
- All membership changes serialize on the organization row. RPCs use SECURITY INVOKER, blank search paths, and service-role-only execution. That role has column-specific access to the required auth identity fields, not password/token columns.
- RLS is enabled on every new public table. Browser roles have no table/RPC access; older broad organization policies cannot bypass team restrictions through the Data API.
- Staff removals and handoffs revoke outstanding recorder links and pending invitations in the affected scope. Every app request reloads current memberships. Notification delivery skips owners whose organization/team membership was removed.
- Mutations require the browser's own origin. New coach API routes fail closed for team members until explicitly added to the route policy.
- Invitation sending is capped at 25 per actor per hour. Failed email acceptance is shown honestly, with a copyable invitation link. Reissuing an invitation invalidates the previous link.
- Database audit history records invitation acceptance, role changes, removals, handoffs, and account activation.

## Verification

`tests/team-access-database.sql` runs transactions under the actual `service_role` and rolls back: email binding, replay, cross-organization/team actions, parent limits, handoffs, last-owner protection, parent-link cleanup, and browser-role denials.

`tests/access-api.test.mts` runs against the disposable local Postgres/PostgREST stack and `tests/access-auth-proxy.mjs`. The latter binds only to loopback, supplies fixture identities, and is never imported by production code. Start Next with `SUPABASE_URL=http://127.0.0.1:54391 npm run dev -- --port 4183`; the ignored local environment needs its disposable service key, session secret, and a dummy anon key. Apply `tests/access-api-fixture.sql` only to the disposable database.

Six API scenarios exercise real route handlers and database operations: team-scoped catalogs/rosters, parent privacy, rejection of old passcodes, same-origin and role checks, legacy/future-route denial, shared-game creation, recorder links, assignments, parent attempts, and immediate removal. The seven existing notification tests also pass. TypeScript and the production build pass. Owner email sign-in, organization selection, management UI, and confirmation dialog were checked in the browser at desktop and 390px phone widths.

Existing Supabase advisories for `current_org_ids()` and leaked-password protection predate this feature. New tables deliberately have no browser RLS policies because their browser grants are revoked; server-mediated access is intentional.
