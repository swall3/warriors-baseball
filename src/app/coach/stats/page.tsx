"use client";
import AnalyticsWorkspace from "@/components/coach/AnalyticsWorkspace";

import { useEffect, useState } from 'react';
import SprayChart from '@/components/coach/spray-chart';
import { canonicalPlayerName } from '@/lib/coach/player-name';
import type { PlayEvent } from '@/lib/coach/types';
import { useCoachBrand } from "@/lib/coach/org-client";
import { toTeamAtBat } from '@/lib/coach/game-types';
import { useCoachStorageKeys } from '@/lib/coach/org-client';

type Play = {
  inning: number;
  outs: number;
  batter: string;
  result: string;
  zone: string;
  x: number;
  y: number;
  runsScored: number;
};

type StoredPin = {
  inning?: number;
  outs?: number;
  batter?: string;
  battingTeam?: string;
  result: string;
  zone?: string;
  x: number;
  y: number;
};

type StoredGameState = {
  pins?: StoredPin[];
};

type ApiGame = {
  id: string;
  label?: string;
  score?: { us: number; opponents: number };
  pins?: StoredPin[];
};

type Stats = {
  totalPlays: number;
  outs: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  favoriteZone: string;
};

export default function StatsPage() {
  const brandTeam = useCoachBrand();
  const storageKeys = useCoachStorageKeys();
  const [stats, setStats] = useState<Stats | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  const [sprayEvents, setSprayEvents] = useState<PlayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exported, setExported] = useState(false);
  const [score, setScore] = useState<{ us: number; opponents: number }>({ us: 0, opponents: 0 });
  const [opponentName, setOpponentName] = useState('Opponents');

  const loadStats = async () => {
    try {
      // Per-org as of MT-3 (T7) — src/lib/coach/storage-keys.ts.
      const raw =
        typeof window !== 'undefined' ? window.localStorage.getItem(storageKeys.state) : null;
      let pins: StoredPin[] = [];
      let nextScore = { us: 0, opponents: 0 };

      let nextOpponentName = 'Opponents';

      if (raw) {
        const gameState = JSON.parse(raw) as StoredGameState & { ourRuns?: number; oppRuns?: number; opponentTeamName?: string };
        pins = Array.isArray(gameState.pins) ? gameState.pins : [];
        nextScore = {
          us: typeof gameState.ourRuns === 'number' ? gameState.ourRuns : 0,
          opponents: typeof gameState.oppRuns === 'number' ? gameState.oppRuns : 0,
        };
        if (typeof gameState.opponentTeamName === 'string' && gameState.opponentTeamName.trim()) {
          nextOpponentName = gameState.opponentTeamName.trim();
        }
      }

      const response = await fetch('/api/coach/games');
      if (response.ok) {
        const data = await response.json();
        if (data.ok && Array.isArray(data.games)) {
          const apiGames = data.games as ApiGame[];
          pins = [
            ...pins,
            ...apiGames.flatMap((game) => Array.isArray(game.pins) ? game.pins : []),
          ];
        }
      }

      const usPins = pins.filter((pin) => toTeamAtBat(pin.battingTeam) === 'us');

      // Calculate stats
      const totalPlays = usPins.length;
      const outs = usPins.filter((p) => p.result === 'out' || p.result === 'fielders_choice' || p.result === 'strikeout').length;
      const hits = usPins.filter((p) => ['single', 'double', 'triple', 'home_run'].includes(p.result)).length;
      const singles = usPins.filter((p) => p.result === 'single').length;
      const doubles = usPins.filter((p) => p.result === 'double').length;
      const triples = usPins.filter((p) => p.result === 'triple').length;
      const homeRuns = usPins.filter((p) => p.result === 'home_run').length;

      // Calculate favorite zone
      const zoneCounts: Record<string, number> = {};
      usPins.forEach((pin) => {
        const zone = pin.zone || 'unknown';
        zoneCounts[zone] = (zoneCounts[zone] || 0) + 1;
      });

      const sortedZones = Object.entries(zoneCounts).sort((a, b) => b[1] - a[1]);
      const favoriteZone = sortedZones.length > 0 ? sortedZones[0][0] : 'N/A';

      setStats({
        totalPlays,
        outs,
        hits,
        singles,
        doubles,
        triples,
        homeRuns,
        favoriteZone,
      });

      // Set plays
      //
      // Both batter reads below go through canonicalPlayerName — fixes B3
      // (MERGE-PLAN.md §0.3, §2.5). This file previously did not import it at
      // all, so "Jack" and "Jackson" appeared as two hitters in the play table
      // and as two series on the spray chart.
      //
      // Note: §2.5 describes this fix as "key `playerMap` on canonical name",
      // matching analytics.ts. This page has no playerMap — it builds two flat
      // arrays that are later grouped/rendered by batter string, so the
      // equivalent fix is to canonicalize at the point the string enters them.
      const playData: Play[] = usPins.map((pin) => ({
        inning: pin.inning ?? 1,
        outs: pin.outs ?? 0,
        batter: canonicalPlayerName(pin.batter),
        result: pin.result,
        zone: pin.zone || 'unknown',
        x: pin.x,
        y: pin.y,
        runsScored: 0,
      }));

      setPlays(playData);
      setSprayEvents(
        usPins.map((pin, index) => ({
          id: `local-${index}`,
          batter: canonicalPlayerName(pin.batter),
          battingTeam: 'us',
          result: pin.result as PlayEvent['result'],
          zone: (pin.zone || 'center_field') as PlayEvent['zone'],
          x: pin.x,
          y: pin.y,
          inning: pin.inning ?? 1,
        }))
      );
      setScore(nextScore);
      setOpponentName(nextOpponentName);
    } catch (error) {
      console.error('Stats load error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, []);

  const handleExport = () => {
    try {
      const lines: string[] = [];
      lines.push(`# ${brandTeam.name} Stat Summary`);
      lines.push('');
      lines.push(`**Score:** ${brandTeam.name} ${score.us} — ${opponentName} ${score.opponents}`);
      if (stats) {
        lines.push(`**Total Plays:** ${stats.totalPlays} · **Hits:** ${stats.hits} · **Outs:** ${stats.outs} · **HR:** ${stats.homeRuns}`);
        lines.push(`**Singles/Doubles/Triples:** ${stats.singles}/${stats.doubles}/${stats.triples}`);
        lines.push(`**Favorite Zone:** ${getZoneLabel(stats.favoriteZone)}`);
      }
      lines.push('');
      lines.push('| Inning | Batter | Result | Zone |');
      lines.push('| --- | --- | --- | --- |');
      for (const p of plays) {
        lines.push(`| ${p.inning} | ${p.batter} | ${p.result} | ${getZoneLabel(p.zone)} |`);
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'game-summary.md';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);

      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed');
    }
  };

  const getZoneLabel = (zone: string) => {
    const labels: Record<string, string> = {
      left_field: 'Left Field',
      left_center: 'Left Center',
      center_field: 'Center Field',
      right_center: 'Right Center',
      right_field: 'Right Field',
      third_base: 'Third Base',
      second_base: 'Second Base',
      first_base: 'First Base',
      pitcher_zone: 'Pitcher',
      catcher_zone: 'Catcher',
    };
    return labels[zone] || zone;
  };

  if (loading) {
    return (
      <AnalyticsWorkspace title="Where the ball goes." description="Explore contact locations and results."><p role="status">Loading stats…</p></AnalyticsWorkspace>
    );
  }

  return (
    <AnalyticsWorkspace title="Where the ball goes." description="Explore contact locations, outcomes, and the recorded game score.">
    <div className="grid gap-5 lg:grid-cols-3">
      <section className="overflow-hidden nf-card  lg:col-span-2">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-d-sel">Spray Chart</p>
            <h3 className="text-2xl font-black tracking-tight">Play Statistics</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg bg-d-sel/12 px-3 py-2 text-xs font-bold uppercase tracking-wide text-d-sel disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] touch-manipulation"
              disabled={stats === null}
            >
              {exported ? 'Exported!' : 'Export'}
            </button>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-d-line bg-d-surface px-3 py-2">
            <p className="text-[11px] text-d-ink-3">Total Plays</p>
            <p className="text-2xl font-black text-d-sel">{stats?.totalPlays || 0}</p>
          </div>
          <div className="rounded-xl border border-d-line bg-d-surface px-3 py-2">
            <p className="text-[11px] text-d-ink-3">Hits</p>
            <p className="text-2xl font-black text-d-pos">{stats?.hits || 0}</p>
          </div>
          <div className="rounded-xl border border-d-line bg-d-surface px-3 py-2">
            <p className="text-[11px] text-d-ink-3">Outs</p>
            <p className="text-2xl font-black text-d-neg">{stats?.outs || 0}</p>
          </div>
          <div className="rounded-xl border border-d-line bg-d-surface px-3 py-2">
            <p className="text-[11px] text-d-ink-3">Home Runs</p>
            <p className="text-2xl font-black text-d-warn">{stats?.homeRuns || 0}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-d-surface px-2 py-1">
            <p className="text-[10px] text-d-ink-3">Singles</p>
            <p className="text-lg font-bold text-d-pos">{stats?.singles || 0}</p>
          </div>
          <div className="rounded-xl bg-d-surface px-2 py-1">
            <p className="text-[10px] text-d-ink-3">Doubles</p>
            <p className="text-lg font-bold text-d-pos">{stats?.doubles || 0}</p>
          </div>
          <div className="rounded-xl bg-d-surface px-2 py-1">
            <p className="text-[10px] text-d-ink-3">Triples</p>
            <p className="text-lg font-bold text-d-pos">{stats?.triples || 0}</p>
          </div>
          <div className="rounded-xl bg-d-surface px-2 py-1">
            <p className="text-[10px] text-d-ink-3">Favorite Zone</p>
            <p className="text-lg font-bold text-d-sel">{getZoneLabel(stats?.favoriteZone || 'N/A')}</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-d-line bg-d-surface">
          <SprayChart events={sprayEvents} />
        </div>

        <div className="overflow-hidden rounded-xl border border-d-line bg-d-bg">
          <table className="w-full text-left">
            <thead className="bg-d-surface text-[10px] font-bold uppercase tracking-wider text-d-ink-3">
              <tr>
                <th className="px-2 py-1">Inning</th>
                <th className="px-2 py-1">Batter</th>
                <th className="px-2 py-1">Result</th>
                <th className="px-2 py-1">Zone</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {plays.map((play, idx) => (
                <tr key={`${play.inning}-${play.batter}-${idx}`} className="border-t border-d-line">
                  <td className="px-2 py-1">{play.inning}</td>
                  <td className="px-2 py-1">{play.batter}</td>
                  <td className="px-2 py-1">{play.result}</td>
                  <td className="px-2 py-1">{getZoneLabel(play.zone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden nf-card ">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-d-sel">Score</p>
          <h3 className="text-xl font-black tracking-tight">Game Score</h3>
        </header>

        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-d-ink-3">{brandTeam.name}</p>
            <p className="text-3xl font-black text-d-sel">{score.us}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-d-ink-3">{opponentName}</p>
            <p className="text-3xl font-black text-d-neg">{score.opponents}</p>
          </div>
        </div>
      </section>
    </div>
    </AnalyticsWorkspace>
  );
}
