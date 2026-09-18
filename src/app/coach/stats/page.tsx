"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import SprayChart from '@/components/coach/spray-chart';
import type { PlayEvent } from '@/lib/coach/types';

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
  battingTeam?: 'outlaws' | 'opponent' | 'wahoos';
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
  score?: { outlaws: number; opponents: number };
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [plays, setPlays] = useState<Play[]>([]);
  const [sprayEvents, setSprayEvents] = useState<PlayEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [exported, setExported] = useState(false);
  const [score, setScore] = useState<{ outlaws: number; opponents: number }>({ outlaws: 0, opponents: 0 });
  const [opponentName, setOpponentName] = useState('Opponents');

  const loadStats = async () => {
    try {
      const STORAGE_KEY = 'outlaws-field-app:v1';
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
      let pins: StoredPin[] = [];
      let nextScore = { outlaws: 0, opponents: 0 };

      let nextOpponentName = 'Opponents';

      if (raw) {
        const gameState = JSON.parse(raw) as StoredGameState & { ourRuns?: number; oppRuns?: number; opponentTeamName?: string };
        pins = Array.isArray(gameState.pins) ? gameState.pins : [];
        nextScore = {
          outlaws: typeof gameState.ourRuns === 'number' ? gameState.ourRuns : 0,
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

      const outlawsPins = pins.filter((pin) => !pin.battingTeam || pin.battingTeam === 'outlaws');

      // Calculate stats
      const totalPlays = outlawsPins.length;
      const outs = outlawsPins.filter((p) => p.result === 'out' || p.result === 'fielders_choice' || p.result === 'strikeout').length;
      const hits = outlawsPins.filter((p) => ['single', 'double', 'triple', 'home_run'].includes(p.result)).length;
      const singles = outlawsPins.filter((p) => p.result === 'single').length;
      const doubles = outlawsPins.filter((p) => p.result === 'double').length;
      const triples = outlawsPins.filter((p) => p.result === 'triple').length;
      const homeRuns = outlawsPins.filter((p) => p.result === 'home_run').length;

      // Calculate favorite zone
      const zoneCounts: Record<string, number> = {};
      outlawsPins.forEach((pin) => {
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
      const playData: Play[] = outlawsPins.map((pin) => ({
        inning: pin.inning ?? 1,
        outs: pin.outs ?? 0,
        batter: pin.batter || 'Unknown',
        result: pin.result,
        zone: pin.zone || 'unknown',
        x: pin.x,
        y: pin.y,
        runsScored: 0,
      }));

      setPlays(playData);
      setSprayEvents(
        outlawsPins.map((pin, index) => ({
          id: `local-${index}`,
          batter: pin.batter || 'Unknown',
          battingTeam: 'outlaws',
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
      lines.push(`# Outlaws Stat Summary`);
      lines.push('');
      lines.push(`**Score:** Outlaws ${score.outlaws} — ${opponentName} ${score.opponents}`);
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
      <div className="flex h-full items-center justify-center">
        <p className="text-xl font-bold">Loading stats...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-7xl gap-5 px-3 py-4 sm:px-6 lg:grid-cols-3">
      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-2xl lg:col-span-2">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Spray Chart</p>
            <h1 className="text-2xl font-black tracking-tight">Play Statistics</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/coach" className="rounded-lg border border-cyan-300/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/30 min-h-[40px] flex items-center touch-manipulation">
              Scoring
            </Link>
            <Link href="/coach/dashboard" className="rounded-lg border border-emerald-300/40 bg-emerald-500/15 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/30 min-h-[40px] flex items-center touch-manipulation">
              Dashboard
            </Link>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-lg bg-cyan-100 px-3 py-2 text-xs font-bold uppercase tracking-wide text-cyan-800 hover:bg-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed min-h-[40px] touch-manipulation"
              disabled={stats === null}
            >
              {exported ? 'Exported!' : 'Export'}
            </button>
          </div>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2">
            <p className="text-[11px] text-slate-400">Total Plays</p>
            <p className="text-2xl font-black text-cyan-100">{stats?.totalPlays || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2">
            <p className="text-[11px] text-slate-400">Hits</p>
            <p className="text-2xl font-black text-emerald-400">{stats?.hits || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2">
            <p className="text-[11px] text-slate-400">Outs</p>
            <p className="text-2xl font-black text-rose-400">{stats?.outs || 0}</p>
          </div>
          <div className="rounded-xl border border-slate-600 bg-slate-800/50 px-3 py-2">
            <p className="text-[11px] text-slate-400">Home Runs</p>
            <p className="text-2xl font-black text-yellow-400">{stats?.homeRuns || 0}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-slate-800/50 px-2 py-1">
            <p className="text-[10px] text-slate-400">Singles</p>
            <p className="text-lg font-bold text-emerald-300">{stats?.singles || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 px-2 py-1">
            <p className="text-[10px] text-slate-400">Doubles</p>
            <p className="text-lg font-bold text-green-300">{stats?.doubles || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 px-2 py-1">
            <p className="text-[10px] text-slate-400">Triples</p>
            <p className="text-lg font-bold text-lime-300">{stats?.triples || 0}</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 px-2 py-1">
            <p className="text-[10px] text-slate-400">Favorite Zone</p>
            <p className="text-lg font-bold text-cyan-200">{getZoneLabel(stats?.favoriteZone || 'N/A')}</p>
          </div>
        </div>

        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/50">
          <SprayChart events={sprayEvents} />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-600 bg-slate-950">
          <table className="w-full text-left">
            <thead className="bg-slate-800/50 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-2 py-1">Inning</th>
                <th className="px-2 py-1">Batter</th>
                <th className="px-2 py-1">Result</th>
                <th className="px-2 py-1">Zone</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {plays.map((play, idx) => (
                <tr key={`${play.inning}-${play.batter}-${idx}`} className="border-t border-slate-800/50">
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

      <section className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-2xl">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Score</p>
          <h1 className="text-xl font-black tracking-tight">Game Score</h1>
        </header>

        <div className="mt-4 flex items-center justify-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-slate-400">Outlaws</p>
            <p className="text-3xl font-black text-cyan-100">{score.outlaws}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400">{opponentName}</p>
            <p className="text-3xl font-black text-rose-400">{score.opponents}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
