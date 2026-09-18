"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import HeatmapCanvas from "@/components/coach/heatmap-canvas";
import type { EventPin } from "@/lib/coach/game-types";
import { computeOpponentIntelligence, computeZoneStats, computePlayerTendencies, type PlayerTendency } from "@/lib/coach/analytics";

type GameSummary = {
  id: string;
  label: string;
  date: string;
  opponentTeamName: string;
  score: { outlaws: number; opponents: number };
  pinCount: number;
  pins: EventPin[];
};

type OpponentOption = {
  name: string;
  games: number;
};

export default function IntelligencePage() {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOpponent, setSelectedOpponent] = useState<string>("");
  const [viewMode, setViewMode] = useState<"our-offense" | "opponent-offense">("opponent-offense");

  useEffect(() => {
    const loadGames = async () => {
      try {
        const res = await fetch("/api/coach/games");
        const data = await res.json();
        if (data.ok) {
          setGames(data.games || []);
          // Auto-select most recent opponent if available
          if (data.games?.length > 0) {
            const latest = data.games[0];
            if (latest.opponentTeamName) {
              setSelectedOpponent(latest.opponentTeamName);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load games", e);
      } finally {
        setLoading(false);
      }
    };
    loadGames();
  }, []);

  const opponentOptions: OpponentOption[] = Array.from(
    new Set(games.map(g => g.opponentTeamName).filter(Boolean))
  ).map(name => ({
    name,
    games: games.filter(g => g.opponentTeamName === name).length,
  }));

  const filteredGames = selectedOpponent
    ? games.filter(g => g.opponentTeamName === selectedOpponent)
    : games;

  const allPins = filteredGames.flatMap(g => g.pins);

  const ourOffense = computeZoneStats(allPins, "outlaws");
  const opponentOffense = computeZoneStats(allPins, "opponent");

  const opponentIntel = selectedOpponent
    ? computeOpponentIntelligence(games, selectedOpponent)
    : null;

  const currentStats = viewMode === "our-offense" ? ourOffense : opponentOffense;

  const playerTendencies = selectedOpponent && viewMode === "opponent-offense"
    ? computePlayerTendencies(allPins, "opponent")
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 pb-24">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Intelligence</h1>
              <p className="text-sm text-slate-400">Opponent tendencies & zone analytics</p>
            </div>
            <nav className="flex flex-wrap gap-2 text-sm">
              <Link href="/coach" className="text-cyan-400 hover:text-cyan-300">Scoring</Link>
              <Link href="/coach/dashboard" className="text-emerald-400 hover:text-emerald-300">Dashboard</Link>
              <Link href="/coach/stats" className="text-sky-400 hover:text-sky-300">Spray</Link>
            </nav>
          </div>
        </div>

        {/* Opponent Selector */}
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Opponent
          </label>
          <select
            value={selectedOpponent}
            onChange={(e) => setSelectedOpponent(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-medium focus:outline-none focus:border-cyan-500"
          >
            <option value="">All opponents</option>
            {opponentOptions.map(opt => (
              <option key={opt.name} value={opt.name}>
                {opt.name} ({opt.games} game{opt.games > 1 ? "s" : ""})
              </option>
            ))}
          </select>
        </div>

        {/* View Toggle */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setViewMode("opponent-offense")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-all min-h-[48px] ${
              viewMode === "opponent-offense"
                ? "border-rose-400 bg-rose-500/20 text-rose-100"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            Opponent Offense
          </button>
          <button
            onClick={() => setViewMode("our-offense")}
            className={`flex-1 rounded-xl border px-4 py-3 text-sm font-bold transition-all min-h-[48px] ${
              viewMode === "our-offense"
                ? "border-emerald-400 bg-emerald-500/20 text-emerald-100"
                : "border-slate-700 bg-slate-900 text-slate-300"
            }`}
          >
            Our Offense
          </button>
        </div>

        {/* Key Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">Total Plays</div>
            <div className="text-4xl font-semibold tabular-nums mt-1">{currentStats.totalPlays}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs text-slate-400">On-Base Rate</div>
            <div className="text-4xl font-semibold tabular-nums mt-1 text-emerald-400">
              {currentStats.overallOnBaseRate}%
            </div>
          </div>
        </div>

        {/* Opponent Intelligence Card */}
        {opponentIntel && viewMode === "opponent-offense" && (
          <div className="mb-6 rounded-2xl border border-rose-900/40 bg-rose-950/20 p-5">
            <div className="text-rose-400 text-sm font-semibold tracking-widest mb-1">INTELLIGENCE</div>
            <div className="text-xl font-bold mb-3">{opponentIntel.opponentName}</div>
            
            <div className="text-sm text-slate-300 mb-4">
              {opponentIntel.gamesPlayed} game{opponentIntel.gamesPlayed > 1 ? "s" : ""} • {opponentIntel.totalPlays} tracked plays
            </div>

            {opponentIntel.topThreatZones.length > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-rose-400 mb-2">Top Damage Zones</div>
                <div className="flex flex-wrap gap-2">
                  {opponentIntel.topThreatZones.map(zone => (
                    <div key={zone} className="rounded-full bg-rose-500/20 px-3 py-1 text-sm text-rose-200 border border-rose-500/30">
                      {zone.replace(/_/g, " ")}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-4 text-sm">
              <span className="font-semibold text-rose-400">Defensive Recommendation:</span>{" "}
              {opponentIntel.recommendedShift}
            </div>
          </div>
        )}

        {/* Per-Player Opponent Tendencies (the killer feature for repeat matchups) */}
        {playerTendencies.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <div>
                <div className="text-xs uppercase tracking-widest text-rose-400">Known Hitters</div>
                <div className="text-sm text-slate-300">When we face {selectedOpponent} again</div>
              </div>
            </div>

            <div className="space-y-3">
              {playerTendencies.slice(0, 6).map((p: PlayerTendency) => (
                <div key={p.batter} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-lg">{p.batter}</div>
                      <div className="text-xs text-slate-400">{p.total} tracked ABs • {p.successRate}% on-base</div>
                    </div>
                    {p.favoriteZone && (
                      <div className="text-right text-xs">
                        <div className="text-slate-400">Favors</div>
                        <div className="font-mono text-rose-400">{p.favoriteZone.replace(/_/g, " ")}</div>
                      </div>
                    )}
                  </div>

                  {Object.keys(p.zones).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-800 text-xs">
                      <div className="text-slate-400 mb-1.5">Zone breakdown</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(p.zones)
                          .sort((a, b) => b[1].total - a[1].total)
                          .slice(0, 4)
                          .map(([zone, z]) => (
                            <div key={zone} className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] tabular-nums">
                              {zone.replace(/_/g, " ")} <span className="text-rose-400">{z.successRate}%</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-3 text-[10px] text-slate-500 px-1">
              Use this to set your defense before the game. Tap a player in the lineup to see their heat.
            </div>
          </div>
        )}

        {/* Heatmap */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="px-5 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
            <div>
              <div className="font-semibold">Zone Heatmap</div>
              <div className="text-xs text-slate-400">
                {viewMode === "opponent-offense" ? "Where they do damage" : "Where we do damage"}
              </div>
            </div>
            <div className="text-xs text-slate-500">Phone friendly • Tap to inspect</div>
          </div>

          <div className="p-4">
            <HeatmapCanvas 
              events={allPins.length > 0 ? allPins.map(p => ({
                ...p,
                id: String(p.id),
                timestamp: new Date().toISOString(),
                eventType: "ball_in_play" as const,
                description: "",
                stateAfter: { outs: 0, outlawsRuns: 0, opponentRuns: 0, bases: { first: null, second: null, third: null } }
              })) : undefined}
            />
          </div>
        </div>

        {/* Zone Breakdown */}
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-3 px-1">Zone Breakdown</div>
          <div className="space-y-2">
            {Object.values(currentStats.zoneStats)
              .sort((a, b) => b.total - a.total)
              .map(stat => (
                <div key={stat.zone} className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <div className="font-medium capitalize">{stat.zone.replace(/_/g, " ")}</div>
                  <div className="flex items-center gap-4 text-sm tabular-nums">
                    <div className="text-slate-400">{stat.total} plays</div>
                    <div className="font-mono text-emerald-400">{stat.successRate}% OB</div>
                    <div className="text-rose-400">{stat.outs} outs</div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {loading && (
          <div className="text-center py-12 text-slate-400">Loading historical data...</div>
        )}

        {!loading && games.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            No saved games yet. Play some games and they’ll appear here.
          </div>
        )}
      </div>
    </div>
  );
}
