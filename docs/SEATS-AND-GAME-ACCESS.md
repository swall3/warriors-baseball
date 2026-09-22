# Work order: org team-seats billing + player-development game gating

Status: **product decision made 2026-09-22 (Stuart) — not yet implemented.** This
supersedes two statements in `TEAM-BILLING.md`: "one subscription per team, not seat
billing" and "Public training remains free."

## Decision 1 — Organization seat licensing

Organizations are billed by **team seats**: an org is assigned a number of seats
equal to the number of teams it needs. A seat = one active team slot. Coaches,
parents, and players on a seated team remain included (no per-user billing).

Direction (implementer may refine mechanics, not the model):

- Move from one-subscription-per-team to **one subscription per organization** with
  a licensed Stripe price and `quantity = seat count`. Owner/manager (from the #14
  roles system) chooses seat count at checkout and can change it later; portal
  quantity changes may be enabled now that quantity is meaningful, or gated behind
  our own UI that calls the API — implementer's call, but seat changes must
  reconcile through the existing webhook/lease machinery.
- Seat enforcement: an org may have at most `seats` **active** teams. Creating or
  activating a team beyond the seat count is blocked with a clear upgrade prompt;
  existing teams are never deleted by a downgrade — excess teams become read-only
  (history stays readable, consistent with current `teamAccess` philosophy: never
  gate active-game commands or historical reads).
- `complimentary` stays as the org-level escape hatch (Warriors org stays
  complimentary). `BILLING_ENFORCE` default-off and test-mode-only constraints all
  still apply — this changes the billing model, not the launch posture.
- Migration path: current per-team billing rows (test-mode only, no real
  customers/charges exist per TEAM-BILLING.md release checks) may be collapsed to
  org scope without a compatibility layer.

### Volume discount tiers (Stuart, 2026-09-22)

Per-seat price discounts as the org adds teams — a standard rec park runs 20+
teams, so the tiers are shaped for that market:

| Seats (teams) | Discount off base per-seat price |
| --- | --- |
| 1–9 | none (base price) |
| 10–19 | 20% |
| 20+ | 30% |

- Implement as **Stripe tiered volume pricing** on the org subscription's price
  (all seats billed at the tier rate the total quantity lands in) — not coupons or
  multiple price IDs, so seat-count changes reprice automatically through the
  existing webhook reconciliation.
- Tier boundaries above are the plan of record; a deeper tier for very large
  leagues (e.g. 40+) is expected later — keep the tier table config/data-driven,
  not hardcoded in checkout logic.
- The **base per-seat dollar amount is still undecided**; tiers are defined as
  percentages so the base can be set independently before launch.

## Decision 2 — Gate player-development games; public sample only

The player-development games under `/games` (daily drill, "Where do I go?",
"Know the rules", "Back up your team") become a **paid app feature**. The public
site keeps a **limited free sample** for marketing.

- Full games library requires a signed-in member (accounts from #14: coach, or
  linked parent) whose team belongs to an org in good standing (paid seats or
  complimentary) — reuse `teamAccess`/`authorize.ts`, add a `player_dev_games`
  capability rather than inventing a parallel check.
- Public sample (implementer's discretion on exact shape, keep it genuinely
  limited): e.g. the daily drill playable but capped (one drill/day or a fixed
  handful of questions), or one full game public and the other three locked. Locked
  games show a teaser + "your team gets full access with InningWise" CTA, not a 404.
- Enforcement must be server-side where answers/content are served, not just a
  hidden nav link.
- Update `TEAM-BILLING.md`'s "Public training remains free" line when this ships.

## Out of scope

Live-mode Stripe launch, pricing amounts, tax/refunds — all still separate
decisions per TEAM-BILLING.md follow-ups.
