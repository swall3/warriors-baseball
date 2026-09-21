import type { EventPin, PlayResult, TeamAtBat } from "./game-types";
import { canonicalPlayerName } from "./player-name";

export type ZoneStat = {
  zone: string;
  total: number;
  hits: number;
  onBase: number; // 1B, 2B, 3B, HR, walk, error, FC count as on-base for this purpose
  outs: number;
  homeRuns: number;
  successRate: number; // onBase / total
};

export type TeamAnalytics = {
  team: "us" | "them";
  totalPlays: number;
  zoneStats: Record<string, ZoneStat>;
  favoriteZone: string | null;
  overallOnBaseRate: number;
};

export type OpponentIntelligence = {
  opponentName: string;
  gamesPlayed: number;
  totalPlays: number;
  zoneStats: Record<string, ZoneStat>;
  topThreatZones: string[]; // zones where they succeed most
  recommendedShift: string; // simple text recommendation
};

const ON_BASE_RESULTS: PlayResult[] = ["single", "double", "triple", "home_run", "walk", "error", "fielders_choice"];

export function computeZoneStats(pins: EventPin[], battingTeam: TeamAtBat): TeamAnalytics {
  const filtered = pins.filter(p => p.battingTeam === battingTeam);
  const zoneMap: Record<string, { total: number; hits: number; onBase: number; outs: number; homeRuns: number }> = {};

  for (const pin of filtered) {
    if (!zoneMap[pin.zone]) {
      zoneMap[pin.zone] = { total: 0, hits: 0, onBase: 0, outs: 0, homeRuns: 0 };
    }
    const z = zoneMap[pin.zone];
    z.total++;
    if (["single", "double", "triple", "home_run"].includes(pin.result)) z.hits++;
    if (ON_BASE_RESULTS.includes(pin.result as PlayResult)) z.onBase++;
    if (pin.result === "out" || pin.result === "strikeout") z.outs++;
    if (pin.result === "home_run") z.homeRuns++;
  }

  const zoneStats: Record<string, ZoneStat> = {};
  let favoriteZone: string | null = null;
  let maxTotal = 0;

  Object.entries(zoneMap).forEach(([zone, data]) => {
    const successRate = data.total > 0 ? Math.round((data.onBase / data.total) * 100) : 0;
    zoneStats[zone] = {
      zone,
      total: data.total,
      hits: data.hits,
      onBase: data.onBase,
      outs: data.outs,
      homeRuns: data.homeRuns,
      successRate,
    };
    if (data.total > maxTotal) {
      maxTotal = data.total;
      favoriteZone = zone;
    }
  });

  const totalOnBase = Object.values(zoneStats).reduce((sum, z) => sum + z.onBase, 0);
  const totalPlays = filtered.length;
  const overallOnBaseRate = totalPlays > 0 ? Math.round((totalOnBase / totalPlays) * 100) : 0;

  return {
    team: battingTeam,
    totalPlays,
    zoneStats,
    favoriteZone,
    overallOnBaseRate,
  };
}

export type PlayerTendency = {
  batter: string;
  total: number;
  onBase: number;
  successRate: number;
  favoriteZone: string | null;
  zones: Record<string, { total: number; onBase: number; successRate: number }>;
};

type PlayerZoneTendency = PlayerTendency["zones"][string];

export function computePlayerTendencies(pins: EventPin[], battingTeam: TeamAtBat): PlayerTendency[] {
  const playerMap: Record<string, { total: number; onBase: number; zones: Record<string, { total: number; onBase: number }> }> = {};

  const filtered = pins.filter(p => p.battingTeam === battingTeam);

  for (const pin of filtered) {
    // Key on the canonical name, not the raw string — fixes B2
    // (MERGE-PLAN.md §0.3, §2.5). Keying on `pin.batter` made "Jack" and
    // "Jackson" two separate hitters on /coach/intel, splitting one kid's
    // spray data across two rows. 14 distinct batter strings exist for 11 kids.
    //
    // MERGE-PLAN.md §2.5 specifies `pin.batterPlayerId ?? canonicalPlayerName(...)`.
    // `EventPin` has no `batterPlayerId` field (see game-types.ts) and the
    // column it would come from is migration 002, which is unapplied. Adding
    // the ?? half now would be dead code referencing a field that does not
    // exist — wire it in when 002 lands and the pin type carries the id.
    const player = canonicalPlayerName(pin.batter);
    if (!playerMap[player]) {
      playerMap[player] = { total: 0, onBase: 0, zones: {} };
    }
    const p = playerMap[player];
    p.total++;
    if (ON_BASE_RESULTS.includes(pin.result as PlayResult)) p.onBase++;

    if (!p.zones[pin.zone]) p.zones[pin.zone] = { total: 0, onBase: 0 };
    p.zones[pin.zone].total++;
    if (ON_BASE_RESULTS.includes(pin.result as PlayResult)) p.zones[pin.zone].onBase++;
  }

  return Object.entries(playerMap)
    .map(([batter, data]) => {
      const favoriteZone = Object.entries(data.zones)
        .sort((a, b) => b[1].total - a[1].total)[0]?.[0] ?? null;

      const zones: Record<string, PlayerZoneTendency> = {};
      Object.entries(data.zones).forEach(([zone, z]) => {
        zones[zone] = {
          total: z.total,
          onBase: z.onBase,
          successRate: z.total > 0 ? Math.round((z.onBase / z.total) * 100) : 0,
        };
      });

      return {
        batter,
        total: data.total,
        onBase: data.onBase,
        successRate: data.total > 0 ? Math.round((data.onBase / data.total) * 100) : 0,
        favoriteZone,
        zones,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function computeOpponentIntelligence(
  allGames: Array<{ opponentTeamName?: string; pins: EventPin[] }>,
  targetOpponent: string
): OpponentIntelligence | null {
  const relevantGames = allGames.filter(g =>
    g.opponentTeamName?.toLowerCase() === targetOpponent.toLowerCase()
  );

  if (relevantGames.length === 0) return null;

  const allPins = relevantGames.flatMap(g => g.pins);
  const opponentPins = allPins.filter(p => p.battingTeam === "them");

  if (opponentPins.length === 0) return null;

  const baseStats = computeZoneStats(opponentPins as EventPin[], "them");

  // Find zones with highest success rate (where they do damage)
  const sortedZones = Object.values(baseStats.zoneStats)
    .filter(z => z.total >= 2) // ignore tiny sample
    .sort((a, b) => b.successRate - a.successRate);

  const topThreatZones = sortedZones.slice(0, 3).map(z => z.zone);

  let recommendedShift = "Standard alignment";
  if (topThreatZones.length > 0) {
    const primary = topThreatZones[0];
    if (primary.includes("left")) recommendedShift = "Shift left field / pull side emphasis";
    else if (primary.includes("right")) recommendedShift = "Shift right / protect opposite field";
    else if (primary.includes("center")) recommendedShift = "Tighten up the middle";
  }

  return {
    opponentName: targetOpponent,
    gamesPlayed: relevantGames.length,
    totalPlays: opponentPins.length,
    zoneStats: baseStats.zoneStats,
    topThreatZones,
    recommendedShift,
  };
}
