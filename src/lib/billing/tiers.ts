// Seat price tiers, kept in git so the amounts are reviewable alongside the code
// that provisions them (scripts/configure-seat-prices.mjs).
//
// These amounts are used for three things only: provisioning the Stripe prices,
// showing an estimate in the checkout UI, and asserting defensively that the
// configured Stripe price still matches this table. They are NEVER used to
// compute a charge — Stripe remains the sole authority on money.
//
// Volume tiers: the total seat quantity selects one rate that applies to every
// seat, so crossing a boundary re-rates the whole subscription.
export const SEAT_TIERS = [
  { upTo: 9, year: 9900, month: 1000 },
  { upTo: 19, year: 8000, month: 800 },
  { upTo: null, year: 7000, month: 700 },
] as const;
export const MAX_SEATS = 500;
export type SeatInterval = "month" | "year";
export function seatUnitAmount(seats: number, interval: SeatInterval): number {
  const tier =
    SEAT_TIERS.find((t) => t.upTo === null || seats <= t.upTo) ??
    SEAT_TIERS[SEAT_TIERS.length - 1];
  return tier[interval];
}
export function seatTotal(seats: number, interval: SeatInterval): number {
  return seats * seatUnitAmount(seats, interval);
}
export function validSeats(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_SEATS
  );
}
