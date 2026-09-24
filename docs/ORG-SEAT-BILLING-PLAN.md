# Org Seat Billing Rework — Implementation Plan

Authored 2026-09-22 by an Opus planning agent from `SEATS-AND-GAME-ACCESS.md` +
full code review. This is the plan of record for the seat-billing implementation
PRs. Product spec: `SEATS-AND-GAME-ACCESS.md`. Current foundation: `TEAM-BILLING.md`.

## 0. What exists today (ground truth)

| Concern | Location | Shape |
|---|---|---|
| Billing row | `public.team_billing`, one per `(org_id, team_id)` | `supabase/migrations/20260922120148_team_billing.sql` |
| Lease RPC | `acquire_billing_lease(uuid,uuid)` — 3 min, updates `team_billing` | same file |
| Orchestration | `checkoutForOwner`, `portal`, `reconcile`, `lease`, `save`, `rowFor`, `billingScope`, `assertCanStartGame` | `src/lib/billing/server.ts` |
| Pure policy | `teamAccess`, `billingMode`, `validInterval`, `trialDays` | `src/lib/billing/policy.ts` |
| Webhook | dedupe → customer lookup → `lease` → `reconcile` | `src/app/api/billing/webhook/route.ts` |
| Team creation | `manage_team_access` RPC, `create_team` branch (line 91-97) — inserts a `team_billing` row | `supabase/migrations/20260922142727_organization_team_access.sql` |
| Route policy | `authorizeRequest` | `src/lib/access/authorize.ts` |

**Two couplings the spec does not mention and that dominate sequencing:**

1. **Notifications depend on `team_billing`.** `queue_team_notification`
   (email_notifications.sql:28-38) joins `public.team_billing b` on
   `(org_id, team_id)` to resolve `owner_user_id`. That is the *only* path that
   queues game, training **and** billing emails. `notify_billing_change` is a
   trigger on `team_billing` (line 66). `src/lib/notifications/server.ts:131`
   also reads `team_billing` for the owner. Collapsing to org scope breaks all
   of this. "No compatibility layer needed" in the spec is about Stripe
   customers/charges, not this join.
2. **`authorize.ts` is the wrong chokepoint for seat enforcement.**
   `authorizeRequest` line 8 is `if (!s.userId || orgAdmin(s)) return;` — owners
   and managers short-circuit the entire policy, and those are exactly the
   people who create teams past the cap and write to a downgraded team. Seat
   enforcement must be a sibling of `assertCanStartGame`, not a branch in
   `authorizeRequest`.

## 1. Data model changes

### 1.1 New table `public.org_billing` (one row per org)

Mirrors `team_billing` minus `team_id`, plus seat state. Keep every existing
column name so `server.ts` diffs stay small.

```
id                   uuid primary key default gen_random_uuid()
org_id               text not null unique references public.organizations(id) on delete restrict
owner_user_id        uuid references auth.users(id) on delete set null
complimentary        boolean not null default false
seats                integer not null default 0 check (seats between 0 and 500)
pending_seats        integer check (pending_seats between 1 and 500)   -- scheduled decrease
pending_seats_at     timestamptz                                        -- period end it applies at
billing_interval     text check (billing_interval in ('month','year'))
stripe_customer_id   text unique
stripe_subscription_id text unique
subscription_status  text not null default 'none' check (...same 9 values...)
current_period_end   timestamptz
cancel_at_period_end boolean not null default false
trial_used           boolean not null default false
checkout_attempt     uuid
checkout_started_at  timestamptz
checkout_interval    text check (checkout_interval in ('month','year'))
checkout_seats       integer
checkout_price_id    text
checkout_session_id  text
lock_token           uuid
lock_until           timestamptz
updated_at           timestamptz not null default now()
```

RLS enabled; `revoke all from public, anon, authenticated`;
`grant select,insert,update to service_role` — byte-for-byte the same posture as
`team_billing`.

### 1.2 `public.teams` additions

```
alter table public.teams add column seat_state text not null default 'active'
  check (seat_state in ('active','read_only'));
alter table public.teams add column created_at timestamptz not null default now();
create index teams_org_seat_state_idx on public.teams(org_id, seat_state) where kind='own';
```

`teams` currently has **no** `created_at` (verified: 008 added only `org_id`
and `kind`). It is required for a deterministic downgrade ordering rule.
Existing rows get `now()` — ties break on `id`. `seat_state` lives on `teams`,
not a side table, because every seat chokepoint already loads the team row.

### 1.3 New lease RPC

`public.acquire_org_billing_lease(p_id uuid, p_token uuid)` — identical body to
`acquire_billing_lease`, retargeted at `org_billing`. Same 3-minute window,
same `security invoker`, same revoke/grant posture.

### 1.4 `billing_webhook_events` — unchanged

Processed-event dedupe is org-agnostic. Do not touch it.

### 1.5 Notification rework (required, not optional)

- `queue_team_notification`: replace the `team_billing` join with `org_members`
  (`join public.org_members m on m.org_id = p_org and m.role='owner'` — the
  same owner resolution `create_team` uses at line 96). Preserves "one
  recipient, the owner" and removes `team_billing` from the email path.
- `notify_billing_change`: drop the trigger on `team_billing`; create
  `notify_org_billing_change` on `org_billing`. Org billing has no `team_id`,
  so fan out over `teams where org_id=new.org_id and kind='own'` (one outbox
  row per team preserves the existing `unique(org_id,team_id,user_id,event_key)`
  and the per-team claim path). Include `seats` in the details payload.
- `src/lib/notifications/server.ts:131`: owner lookup → `org_members` where
  `role='owner'`.
- Webhook's `after(() => safelyDeliver(org_id, team_id))` → `safelyDeliver(org_id)`.
  Already supported: `deliverPending(org, team = null)` at server.ts:107, and
  `claim_notification` handles `p_team is null` (migration line 73).

### 1.6 Additive migration sequence

| # | File (suggested) | Contents | Reversible |
|---|---|---|---|
| M1 | `..._org_billing.sql` | `org_billing`, `teams.seat_state`, `teams.created_at`, index, `acquire_org_billing_lease`, backfill | yes (nothing reads it) |
| M2 | `..._org_billing_notifications.sql` | `create or replace queue_team_notification` → `org_members`; drop `queue_billing_email` trigger; `notify_org_billing_change` on `org_billing` | yes |
| M3 | `..._org_seat_enforcement.sql` | `create or replace manage_team_access` with seat check in `create_team`, new `set_team_seat_state` action, stop inserting `team_billing` | yes |
| M4 | `..._drop_team_billing.sql` | drop `acquire_billing_lease`, drop `notify_billing_change`, `drop table public.team_billing` | no — ship last |

**Backfill in M1** (one row per org that has any `team_billing` row):

```sql
insert into public.org_billing (org_id, owner_user_id, complimentary, seats)
select b.org_id,
       coalesce(
         (select m.user_id from public.org_members m
          where m.org_id=b.org_id and m.role='owner' order by m.created_at limit 1),
         min(b.owner_user_id)
       ),
       bool_or(b.complimentary),
       (select count(*) from public.teams t
        where t.org_id=b.org_id and t.kind='own')
from public.team_billing b group by b.org_id
on conflict (org_id) do nothing;
```

Seats backfill to the org's current own-team count so no existing org is
instantly over cap. `stripe_customer_id` / `stripe_subscription_id` /
`subscription_status` are deliberately **not** carried over — a per-team
test-mode customer is not an org customer. Any test-mode subscriptions get
cancelled by hand in the Stripe test dashboard (see risk 6).

## 2. Stripe object model

### 2.1 One product, two tiered-volume prices

Provision via a new `scripts/configure-seat-prices.mjs` (same operator-terminal
pattern as `scripts/configure-billing-owner.mjs`) so tier amounts are
reviewable in git.

```js
const product = await stripe.products.create({ name: "InningWise Team Seats" });
const annual = await stripe.prices.create({
  product: product.id, currency: "usd", nickname: "Team seats — annual",
  recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
  billing_scheme: "tiered", tiers_mode: "volume",
  tiers: [
    { up_to: 9,     unit_amount: 9900 },
    { up_to: 19,    unit_amount: 8000 },
    { up_to: "inf", unit_amount: 7000 },
  ],
});
const monthly = await stripe.prices.create({
  product: product.id, currency: "usd", nickname: "Team seats — monthly",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
  billing_scheme: "tiered", tiers_mode: "volume",
  tiers: [
    { up_to: 9,     unit_amount: 1000 },
    { up_to: 19,    unit_amount:  800 },
    { up_to: "inf", unit_amount:  700 },
  ],
});
```

`billing_scheme:'tiered'` + `tiers_mode:'volume'` + `tiers[]` confirmed against
the Stripe price-create reference (`tiers` required when tiered; top-level
`unit_amount` must be omitted). `volume` = total quantity picks one rate for
all seats, per the pricing table. Env slots unchanged:
`STRIPE_TEAM_MONTHLY_PRICE_ID`, `STRIPE_TEAM_ANNUAL_PRICE_ID`.

### 2.2 Keep the tier table data-driven

New `src/lib/billing/tiers.ts`:

```ts
export const SEAT_TIERS = [
  { upTo: 9,    year: 9900, month: 1000 },
  { upTo: 19,   year: 8000, month:  800 },
  { upTo: null, year: 7000, month:  700 },
] as const;
export const MAX_SEATS = 500;
export function seatUnitAmount(seats: number, interval: "month" | "year"): number
export function seatTotal(seats: number, interval: "month" | "year"): number
export function validSeats(value: unknown): value is number   // integer, 1..MAX_SEATS
```

Used for checkout UI estimates, the provisioning script, and a defensive
assertion that the configured Stripe price's tiers match. **Never** used to
compute a charge — Stripe remains the authority on money.

### 2.3 Checkout session creation (`checkoutForOwner`, server.ts:222-333)

All inside the existing lease:

- Signature becomes `(initial: OrgBillingRow, user, interval, seats, stripe)`.
- Validate `validSeats(seats)` **and** `seats >= activeOwnTeamCount(orgId)`
  before any Stripe call (don't burn the idempotency key on invalid input).
- Extend the price guard (server.ts:287-297):
  ```ts
  const price = await stripe.prices.retrieve(priceId, { expand: ["tiers"] });
  // tiers are NOT returned by default; the expand is required.
  if (price.billing_scheme !== "tiered" || price.tiers_mode !== "volume") fail();
  if (!tiersMatch(price.tiers, SEAT_TIERS, interval)) fail();
  ```
- `line_items: [{ price: row.checkout_price_id!, quantity: seats }]`.
- **Do not set `adjustable_quantity`** (needs our own decrease flow §2.5, and
  Stripe's selector caps at 99 by default — wrong for 100+ team leagues).
- Persist `checkout_seats`; the re-entrancy rule at 270-279 extends to
  "interval OR seats differ → expire and recreate; identical → reuse URL".
- Success/cancel URLs drop `?team=`.
- `subscription_data.metadata.inningwise_billing_id` keeps carrying `row.id` —
  `reconcile`'s metadata filter (server.ts:190) works unchanged.

### 2.4 Customer portal — do NOT enable quantity changes

A seat *decrease* requires deciding which excess teams go read-only; the portal
cannot ask that, so a portal decrease would arrive with no owner intent to
resolve it. Portal keeps payment-method updates + cancel-at-period-end only.
`TEAM-BILLING.md` step 3's setting is unchanged but its *reason* must be
rewritten (currently cites "one subscription per team", which becomes false).

### 2.5 New seat-change route

`POST /api/coach/billing/seats` → `changeSeats(request, seats, teamsToRetire?)`
in `src/lib/billing/server.ts`, following the portal route shape. Flow, inside
`lease(row.id, ...)`:

1. Recheck ownership after the lease (mirrors server.ts:229-231).
2. `reconcile(row, token, stripe)` first — canonical state before deciding.
3. Reject if `complimentary` (409) or status not `active|trialing|past_due` (409).
4. `validSeats(seats)`; no-op if unchanged.
5. **Increase** → `stripe.subscriptions.update(subId, { items: [{ id: itemId,
   quantity: seats }], proration_behavior: "create_prorations" },
   { idempotencyKey: `iw-seats-${row.id}-${subId}-${seats}` })`, then
   `reconcile` again.
6. **Decrease** → if `seats < activeOwnTeamCount`, 409 with the active-team
   list; caller resubmits with explicit `teams: [ids]` of length
   `activeCount - seats`. Then write `pending_seats = seats`,
   `pending_seats_at = current_period_end`, mark chosen teams
   `seat_state='read_only'` immediately (inert while `BILLING_ENFORCE` off).
   No Stripe call today.
7. Renewal: in `reconcile`, when the canonical subscription's period start has
   advanced past `pending_seats_at`, `subscriptions.update(...,
   { proration_behavior: "none" })` to the pending quantity, clear pending cols.

### 2.6 Proration policy

- **Increase: immediate, `create_prorations`** (prorated difference on next invoice).
- **Decrease: period end, no refund/credit** — via `pending_seats` columns, NOT
  Stripe subscription schedules (schedules add a second object class into
  `reconcile`, whose safety argument rests on "read the canonical subscription
  list, at most one current"). Tradeoff: our DB holds the scheduled intent, so
  the nightly-reconciliation follow-up in TEAM-BILLING.md gains value.
- **Tier crossing re-rates every seat** (9→10 annual moves all 10 to $80;
  Stripe emits credit+charge lines). Do not assert the arithmetic in code —
  observe it in test mode at 9→10 and 19→20 before PR5 merges and record the
  invoice lines in `TEAM-BILLING.md`.
- No refunds/disputes — out of scope per SEATS-AND-GAME-ACCESS.md.

### 2.7 Webhook reconciliation changes

`webhook/route.ts`: `.from("team_billing")` → `.from("org_billing")` (line 65);
`safelyDeliver(lookup.data.org_id)` (line 83). Signature verification, livemode
reject, 1 MB caps, allowlist, dedupe, "mapping pending → 503" all untouched.

`reconcile` (server.ts:173-210) gains:

```ts
const item = sub.items.data.find(i => i.price?.recurring?.usage_type !== "metered") ?? sub.items.data[0];
await save(row, token, {
  ...existing fields...,
  billing_interval: item?.price?.recurring?.interval ?? row.billing_interval,
  // Stripe never overwrites an operator-granted complimentary seat count.
  ...(row.complimentary ? {} : { seats: liveStatus ? (item?.quantity ?? row.seats) : row.seats }),
});
```

`liveStatus` excludes `canceled`/`incomplete_expired` — on cancellation the
last known seat count is retained; access is governed by `subscription_status`,
not by zeroing seats.

**Then, still inside the lease, the over-seat safety net:** if
`activeOwnTeamCount > seats`, flip newest teams
(`order by created_at desc, id desc`) to `read_only` until the count fits. Runs
regardless of `BILLING_ENFORCE` so stored state is truthful; only *enforcement*
reads the flag. This catches decreases arriving from outside our UI.

## 3. Seat enforcement

### 3.1 Rule

`active own teams ≤ seats`, unless `complimentary` (unlimited). `kind='own'`
only — opponent teams never count (filter already applied in
`catalog/route.ts:18`, `access/route.ts:30`).

### 3.2 Creation chokepoint — `manage_team_access`, `create_team` branch

(migration 20260922142727, lines 91-97.) The function already takes
`select ... from public.organizations where id=p_org and active for update`
before every branch — the seat check under that existing row lock is race-free
with no new locking. `access/route.ts:138-145` surfaces only `P0001` messages,
so the upgrade prompt must be
`raise exception 'All % team seats are in use. Add seats in Billing to create another team.', seat_limit;`.

The RPC cannot read `BILLING_ENFORCE` — pass it in `p_data` from
`access/route.ts` (server-side value, service-role-only RPC):
`{ ...existing, enforceSeats: process.env.BILLING_ENFORCE === "true" }`.

Also **remove the `insert into public.team_billing` at line 96** — new teams
inherit the org subscription.

### 3.3 Activation chokepoint — new `set_team_seat_state` action

Same RPC, same lock. `read_only → active` rechecks the cap (same P0001
message); `active → read_only` always allowed. Owner/manager only. Add the
action to the allowlist at `access/route.ts:106-115`.

### 3.4 Write chokepoint — `assertTeamWritable`, NOT authorize.ts

New export in `src/lib/billing/server.ts` next to `assertCanStartGame`:

```ts
export async function assertTeamWritable(orgId: string, teamId: string) {
  if (process.env.BILLING_ENFORCE !== "true") return;   // launch posture unchanged
  // org_billing.complimentary bypasses; teams.seat_state='read_only' throws 402
}
```

Call sites (after existing authorization): prepare-new-game
(`src/lib/coach/live/store.ts:65-66`, beside `assertCanStartGame`), roster
writes, training-assignment writes, lineup-plan writes (non-GET routes).

### 3.5 Read-only semantics (never destructive)

| Capability | read_only team |
|---|---|
| All GETs — history, reports, analytics, rosters | allowed |
| Commands on an already-started live game | allowed — `canFinishGame` stays true |
| Prepare/create a new game | blocked, 402 + upgrade prompt |
| Roster / training / lineup writes | blocked, 402 |
| Team deletion | never — downgrade only sets `seat_state` |
| Reactivation | `set_team_seat_state` once a seat is free |

### 3.6 `teamAccess` extension

`BillingState` gains optional `seat_state?: "active" | "read_only"` (optional →
existing tests pass unmodified). Returns add `canWrite`; `canStartGame` becomes
`canWrite && (complimentary || paid)`; `reason` gains `"seat_retired"`.

## 4. Safety machinery — preservation map

| Mechanism | After |
|---|---|
| 3-minute lease | `acquire_org_billing_lease`, identical semantics; checkout, portal, seats change, webhook reconcile all inside `lease()`; `save()` keeps `lock_token`+`lock_until` guard |
| Idempotency keys | unchanged (`row.id` is now org billing id); new deterministic `iw-seats-${row.id}-${subId}-${seats}` |
| 23-hour ambiguous checkout | unchanged |
| Processed-event dedupe | unchanged |
| Test-mode-only guard | unchanged; price guard extended with tier assertions, never relaxed |
| `BILLING_ENFORCE` default off | `assertCanStartGame`, `assertTeamWritable`, and the create_team seat check all no-op when unset; seat state still stored truthfully |
| Complimentary orgs | refuses checkout, bypasses seat cap, `reconcile` never writes `seats`; Warriors stays complimentary via backfill `bool_or` |
| Owner provisioning | `configure-billing-owner.mjs ORG_ID EMAIL [--complimentary] [--seats N]` (drops TEAM_ID); rewrite TEAM-BILLING.md step 6 |
| Billing cookie / no card data | unchanged; ownership probe queries `org_billing` by `org_id` |
| Non-2xx → Stripe retries | unchanged |
| RLS + no browser grants | `org_billing` same posture; privilege assertions in `tests/billing-service.test.mts:213-240` ported, not dropped |

## 5. Test plan

### 5.1 `tests/billing-policy.test.mjs` (pure)

Existing four pass unmodified. New: `seatUnitAmount` boundaries at
{1,5,9|10,15,19|20,21,100} both intervals; `seatTotal` asserts the volume cliff
deliberately (9×annual=89,100 vs 10×annual=80,000; 19→152,000; 20→140,000 —
the spec's $1,400 figure); `validSeats` rejects 0/-1/1.5/"10"/501/null/NaN,
accepts 1 and 500; `teamAccess` with `seat_state:"read_only"` →
canStartGame=false, canWrite=false, canReadHistory=true, canFinishGame=true,
reason="seat_retired"; complimentary overrides; enforce=false → all true.

### 5.2 `tests/billing-service.test.mts` (disposable Postgres + fake Stripe)

Harness: `reset()` inserts `org_billing` without team_id; `fakeStripe()` gains
`subscriptions.update` (recording params+idempotency keys), `prices.retrieve`
returning billing_scheme/tiers_mode/tiers and asserting `expand` was passed,
items carrying `{id, quantity, price.recurring.interval}`. All seven existing
tests port. New: (1) checkout carries `quantity: seats`; per_unit price
rejected 503; mismatched tiers rejected 503. (2) seats below active own-team
count rejected before any Stripe call. (3) interval switch with quantity:
(month,5)→(year,5) expires+recreates; (month,5)→(month,12) also; (month,5)
twice reuses URL, one Stripe call. (4) 9→10: one `subscriptions.update`
quantity 10, create_prorations; retry reuses idempotency key. (5) 19→20 same.
(6) downgrade past seat count: 12 seats/12 teams → request 8 without team list
→ 409 with candidates, no Stripe call; resubmit with 4 ids → exactly those 4
read_only, pending_seats=8, row counts in teams/games/play_events unchanged.
(7) reconcile persists seats from item quantity; stale lower-seat snapshot
can't lower a canonically higher count; complimentary seats never touched.
(8) over-seat safety net: seats=3 with 5 active teams → two newest read_only.
(9) `manage_team_access` create_team at cap with enforceSeats=true raises
P0001 with the upgrade wording; false succeeds; `set_team_seat_state`
reactivation blocked at cap, allowed below.

### 5.3 `tests/billing-api.test.mjs` (local dev server, fake keys)

Ported: `GET /api/coach/billing` org-scoped (no `?team`), still omits
stripe_customer_id/owner_user_id; 401/403/foreign-origin loops; the four
webhook signature assertions unchanged. New: `POST /api/coach/billing/seats` →
401 unauth, 403 passcode-owner and viewer, 403 foreign origin, 400 bad seats.

### 5.4 Collateral suites (part of PR 2, easy to miss)

`tests/notifications-database.sql:2,31` and
`tests/notifications-service.test.mts:64,135,145` insert/update `team_billing`.
They must move to `org_members` + `org_billing` in the same PR that changes
`queue_team_notification`, or the seven notification tests break.

## 6. PR sequence

| # | Title | Size | Contents | Notes |
|---|---|---|---|---|
| 1 | Add org billing schema (additive, inert) | S | M1 only | Nothing reads it. Safe to deploy and sit. |
| 2 | Move billing to organization scope | L, atomic | server.ts scope change, 4 billing routes, webhook, M2 notifications, notifications/server.ts:131, configure-billing-owner.mjs, minimal billing page (drop team selector), all 3 billing suites + 2 notification fixtures, TEAM-BILLING.md | Cannot split: notification join and billing row are the same object. |
| 3 | Drop `team_billing` | XS | M4 | After PR 2 soaks. Point of no return. |
| 4 | Tiered seat pricing at checkout | M | tiers.ts, price guard w/ expand, quantity in line items, checkout_seats re-entrancy, reconcile persists seats/interval, configure-seat-prices.mjs, tests | Coherent alone; seat changes via support until PR 5. |
| 5 | Self-serve seat changes + proration | M | /api/coach/billing/seats, changeSeats, pending_seats migration, renewal application, over-seat safety net, portal docs, tests | Only after 9→10 and 19→20 proration observed in test mode. |
| 6 | Seat enforcement | M | M3, enforceSeats passthrough, assertTeamWritable + 4 call sites, teamAccess extension | Inert while BILLING_ENFORCE off; keep after PR 5 so a capped org has a self-serve fix. |
| 7 | Seat UI + pricing copy | M | Seat picker (annual default, tier-aware estimate), upgrade prompt, read-only banner, billing page copy | Current heading "One team. Everyone included. / No extra scoring seats." contradicts seat billing — must not ship past PR 4. |

Must land together: PR 2 internally; PR 6's M3 + the enforceSeats route change;
if PR 7 slips, the heading fix rides with PR 4.

## 7. Risks and open questions

**Product (default answers taken; Stuart can override):**
1. Seat enforcement rides `BILLING_ENFORCE` — assumed YES (creation and write
   blocks no-op while off; state tracked truthfully).
2. Who may buy seats: plan keeps **owner-only** (spec said owner/manager, but
   owner-only preserves the deliberate PR#11 safety property). Flag before PR 4.
3. Downgrade default: newest-first by `created_at` when the owner doesn't
   choose; UI should force an explicit choice.
4. Read-only teams keep receiving owner emails (notification eligibility
   unchanged).

**Technical:**
5. Tier-crossing proration arithmetic deliberately not asserted — observe in
   test mode, record in TEAM-BILLING.md before PR 5.
6. Existing test-mode Stripe objects are not migrated; backfill leaves
   stripe ids null. Cancel any PR#11-era test subscriptions by hand.
7. "Config-driven tiers" removes only the code change — a future 40+ tier
   still needs a NEW Stripe price (tiers immutable) and subscription migration.
8. `trial_used` becomes org-wide (moot while BILLING_TRIAL_DAYS=0).
9. Canceled subscription retains last seat count; access keyed off status, not
   zeroed seats (avoids mass-retiring teams on a lapsed card).
10. PR 2 atomicity is the main delivery risk; mitigated by PR 1 landing first.

**Verify against the live test Stripe account before relying on:** that
`prices.retrieve(id, {expand:['tiers']})` returns tiers in the installed SDK;
the invoice line shape of a mid-cycle tier crossing; `subscriptions.update`
with `proration_behavior:"none"` at renewal on a tiered price.

Sources: Stripe price-create API reference; Stripe adjustable-quantity docs.
