import type { LiveGame } from "./model";
export type PitchRules = {
  name: string;
  dailyLimit: number;
  warnAt: number;
  rest: { above: number; days: number }[];
};
export function validatePitchRules(r: PitchRules) {
  if (
    !r ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.length > 80 ||
    !Number.isInteger(r.dailyLimit) ||
    r.dailyLimit < 1 ||
    r.dailyLimit > 200 ||
    !Number.isInteger(r.warnAt) ||
    r.warnAt < 1 ||
    r.warnAt > r.dailyLimit ||
    !Array.isArray(r.rest) ||
    r.rest.length > 10
  )
    throw new Error(
      "Enter a rule name, daily limit (1–200), and warning at or below the limit.",
    );
  let previous = -1,
    days = -1;
  for (const tier of r.rest) {
    if (
      !Number.isInteger(tier.above) ||
      tier.above < 0 ||
      tier.above >= r.dailyLimit ||
      tier.above <= previous ||
      !Number.isInteger(tier.days) ||
      tier.days < 0 ||
      tier.days > 14 ||
      tier.days < days
    )
      throw new Error(
        "Rest thresholds must increase, stay below the daily limit, and use 0–14 nondecreasing rest days.",
      );
    previous = tier.above;
    days = tier.days;
  }
}
export type Outing = { date: string; counts: Record<string, number> };
export function requiredRest(pitches: number, rules: PitchRules) {
  return rules.rest.reduce(
    (days, t) => (pitches > t.above ? Math.max(days, t.days) : days),
    0,
  );
}
export function pitchingAvailability(
  id: string,
  date: string,
  rules: PitchRules,
  outings: Outing[],
  current = 0,
) {
  const daily: Record<string, number> = {};
  for (const outing of outings)
    if (outing.date <= date)
      daily[outing.date] = (daily[outing.date] ?? 0) + (outing.counts[id] ?? 0);
  const today = (daily[date] ?? 0) + current;
  let availableOn = date;
  for (const [day, count] of Object.entries(daily))
    if (day < date && count > 0) {
      const end = new Date(
        Date.parse(day) + 86400000 * (requiredRest(count, rules) + 1),
      )
        .toISOString()
        .slice(0, 10);
      if (end > availableOn) availableOn = end;
    }
  return {
    today,
    remaining: Math.max(0, rules.dailyLimit - today),
    availableOn,
    resting: availableOn > date,
    atLimit: today >= rules.dailyLimit,
    warning: today >= rules.warnAt,
    restDays: requiredRest(today, rules),
  };
}
export function outingFromGame(game: LiveGame): Outing {
  return {
    date: game.config.date,
    counts: Object.fromEntries(
      Object.entries(game.pitchCounts)
        .filter(([key]) => key.startsWith("us:"))
        .map(([key, count]) => [key.slice(3), count]),
    ),
  };
}
