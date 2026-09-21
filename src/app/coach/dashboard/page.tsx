'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import HeatmapCanvas from '@/components/coach/heatmap-canvas';
import type { PlayEvent } from '@/lib/coach/types';
import { canonicalPlayerName } from '@/lib/coach/player-name';
import { team as brandTeam } from '@/lib/brand-config';
import { readScoreUs, readUsLineup, toTeamAtBat } from '@/lib/coach/game-types';
import { useCoachStorageKeys } from '@/lib/coach/org-client';

type TeamKey = 'us' | 'them';
type Scope = 'current' | 'multiple' | 'all';

type StoredPin = {
  id: number | string;
  x: number;
  y: number;
  result: string;
  batter?: string;
  inning?: number;
  // Widened to string on purpose: these pins come straight out of localStorage
  // and carry three generations of vocabulary ('outlaws'/'opponent' pre-006,
  // 'wahoos' older still, 'us'/'them' now). Every read goes through
  // toTeamAtBat() rather than comparing the raw value.
  battingTeam?: string;
  zone?: string;
  description?: string;
};

type StoredGame = {
  id: string;
  label?: string;
  date?: string;
  pins?: StoredPin[];
  score?: { us: number; opponents: number };
  opponentTeamName?: string;
};

type DefenseGroupName = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type DefenseAssignments = Record<string, string>;
type DefenseGroups = Record<DefenseGroupName, DefenseAssignments>;

type DefenseSnapshot = {
  groups: DefenseGroups | null;
  perInning: Record<number, DefenseGroupName> | null;
  usLineup: string[];
  score: { us: number; opponents: number };
  opponentTeamName: string;
};

// The live-state and history keys are per-org as of MT-3 (T7) and are passed
// in from useCoachStorageKeys() — see the note on the same constants in
// coach/page.tsx and src/lib/coach/storage-keys.ts.
const DEFENSE_SPOTS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'LCF', 'RCF', 'RF', 'BENCH'] as const;
const DEFENSE_GROUP_NAMES: DefenseGroupName[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PLANNED_INNINGS = 6;

function toDateLabel(value: number | string): string {
  const d = typeof value === 'number' ? new Date(value) : new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function loadGames(stateKey: string, historyKey: string): StoredGame[] {
  if (typeof window === 'undefined') return [];

  let currentPins: StoredPin[] = [];
  let currentOpponentTeamName = 'Opponents';
  try {
    const raw = window.localStorage.getItem(stateKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      currentPins = Array.isArray(parsed?.pins) ? parsed.pins : [];
      if (typeof parsed?.opponentTeamName === 'string' && parsed.opponentTeamName.trim()) {
        currentOpponentTeamName = parsed.opponentTeamName.trim();
      }
    }
  } catch {}

  let historicalGames: StoredGame[] = [];
  try {
    const raw = window.localStorage.getItem(historyKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      historicalGames = Array.isArray(parsed) ? parsed : [];
    }
  } catch {}

  const currentGame: StoredGame = {
    id: 'current',
    label: `Current vs ${currentOpponentTeamName} (${toDateLabel(Date.now())})`,
    date: new Date().toISOString(),
    pins: currentPins,
    opponentTeamName: currentOpponentTeamName,
  };

  const normalizedHistory = historicalGames
    .filter((g) => g && Array.isArray(g.pins))
    .map((g, idx) => ({
      id: g.id || `game-${idx + 1}`,
      label: g.label || `Game ${idx + 1}${g.date ? ` (${toDateLabel(g.date)})` : ''}`,
      date: g.date,
      pins: g.pins || [],
      opponentTeamName: typeof g.opponentTeamName === 'string' && g.opponentTeamName.trim() ? g.opponentTeamName.trim() : 'Opponents',
    }));

  return [currentGame, ...normalizedHistory];
}

function loadDefense(stateKey: string): DefenseSnapshot {
  if (typeof window === 'undefined') {
    return { groups: null, perInning: null, usLineup: [], score: { us: 0, opponents: 0 }, opponentTeamName: 'Opponents' };
  }
  try {
    const raw = window.localStorage.getItem(stateKey);
    if (!raw) return { groups: null, perInning: null, usLineup: [], score: { us: 0, opponents: 0 }, opponentTeamName: 'Opponents' };
    const parsed = JSON.parse(raw);
    return {
      groups: parsed.defenseGroups || null,
      perInning: parsed.inningDefenseGroup || null,
      // readUsLineup, not `parsed.usLineup`: a blob written before 006 stores
      // the batting order under `outlawsLineup`, and reading only the new key
      // would show an empty lineup and a fairness grid with no players in it.
      usLineup: readUsLineup(parsed) ?? [],
      score: {
        us: typeof parsed.ourRuns === 'number' ? parsed.ourRuns : 0,
        opponents: typeof parsed.oppRuns === 'number' ? parsed.oppRuns : 0,
      },
      opponentTeamName: typeof parsed.opponentTeamName === 'string' && parsed.opponentTeamName.trim() ? parsed.opponentTeamName.trim() : 'Opponents',
    };
  } catch {
    return { groups: null, perInning: null, usLineup: [], score: { us: 0, opponents: 0 }, opponentTeamName: 'Opponents' };
  }
}

function groupForInning(perInning: Record<number, DefenseGroupName> | null, inning: number): DefenseGroupName {
  if (perInning && perInning[inning]) return perInning[inning];
  return DEFENSE_GROUP_NAMES[(Math.max(inning, 1) - 1) % DEFENSE_GROUP_NAMES.length];
}

function buildInningGrid(snapshot: DefenseSnapshot, innings = PLANNED_INNINGS) {
  const rows = DEFENSE_SPOTS.map((spot) => {
    const cells: Array<{ inning: number; player: string; group: DefenseGroupName }> = [];
    for (let i = 1; i <= innings; i++) {
      const group = groupForInning(snapshot.perInning, i);
      const rawPlayer = (snapshot.groups?.[group]?.[spot] || '').trim();
      const player = rawPlayer ? canonicalPlayerName(rawPlayer) : '';
      cells.push({ inning: i, player, group });
    }
    return { spot, cells };
  });
  return rows;
}

function buildFairness(snapshot: DefenseSnapshot, innings = PLANNED_INNINGS) {
  const players = new Set<string>(snapshot.usLineup.map((name) => canonicalPlayerName(name)));
  for (const group of DEFENSE_GROUP_NAMES) {
    const assignments = snapshot.groups?.[group];
    if (!assignments) continue;
    for (const spot of DEFENSE_SPOTS) {
      const rawName = (assignments[spot] || '').trim();
      if (!rawName) continue;
      players.add(canonicalPlayerName(rawName));
    }
  }

  const playerList = Array.from(players).filter((p) => p && p.trim()).sort();
  const counts: Record<string, Record<string, number>> = {};
  for (const player of playerList) {
    counts[player] = {};
    for (const spot of DEFENSE_SPOTS) counts[player][spot] = 0;
  }

  for (let i = 1; i <= innings; i++) {
    const group = groupForInning(snapshot.perInning, i);
    const assignments = snapshot.groups?.[group];
    if (!assignments) continue;
    for (const spot of DEFENSE_SPOTS) {
      const rawName = (assignments[spot] || '').trim();
      if (!rawName) continue;
      const name = canonicalPlayerName(rawName);
      if (!counts[name]) {
        counts[name] = {};
        for (const s of DEFENSE_SPOTS) counts[name][s] = 0;
      }
      counts[name][spot] += 1;
    }
  }

  return playerList.length > 0 ? playerList.map((player) => ({ player, counts: counts[player] })) : Object.keys(counts).sort().map((player) => ({ player, counts: counts[player] }));
}

const ZONE_LABELS: Record<string, string> = {
  left_field: 'LF',
  left_center: 'LCF',
  center_field: 'CF',
  right_center: 'RCF',
  right_field: 'RF',
  third_base: '3B',
  shortstop: 'SS',
  second_base: '2B',
  first_base: '1B',
  pitcher_zone: 'P',
  catcher_zone: 'C',
};

function zoneByPoint(x: number, y: number): string {
  if (y > 78) {
    if (x < 43) return 'third_base';
    if (x > 57) return 'first_base';
    return 'catcher_zone';
  }
  if (y > 64) {
    if (x < 44) return 'shortstop';
    if (x > 56) return 'second_base';
    return 'pitcher_zone';
  }
  if (x < 30) return 'left_field';
  if (x < 44) return 'left_center';
  if (x <= 56) return 'center_field';
  if (x <= 70) return 'right_center';
  return 'right_field';
}

function buildZoneStats(pins: StoredPin[], selectedTeam: TeamKey) {
  const isHit = (r: string) => ['single', 'double', 'triple', 'home_run', 'hit'].includes(r);
  const isOutResult = (r: string) => ['out', 'strikeout', 'fielders_choice'].includes(r);
  const teamOf = (p: StoredPin): TeamKey => toTeamAtBat(p.battingTeam);
  const zones: Record<string, { hits: number; outs: number }> = {};
  for (const key of Object.keys(ZONE_LABELS)) zones[key] = { hits: 0, outs: 0 };
  for (const p of pins) {
    if (teamOf(p) !== selectedTeam) continue;
    const z = p.zone && zones[p.zone] ? p.zone : zoneByPoint(p.x, p.y);
    if (!zones[z]) zones[z] = { hits: 0, outs: 0 };
    if (isHit(p.result)) zones[z].hits++;
    else if (isOutResult(p.result)) zones[z].outs++;
  }
  return zones;
}

const HIT_RESULTS = new Set(['single', 'double', 'triple', 'home_run', 'hit']);
const OUT_RESULTS = new Set(['out', 'strikeout', 'fielders_choice']);
const REACHED_RESULTS = new Set(['single', 'double', 'triple', 'home_run', 'walk', 'error']);

function teamOfPin(pin: StoredPin): TeamKey {
  return toTeamAtBat(pin.battingTeam);
}

function buildPlayerReports(pins: StoredPin[], selectedTeam: TeamKey) {
  const reports: Record<string, {
    player: string;
    pa: number;
    ab: number;
    hits: number;
    walks: number;
    strikeouts: number;
    reachedOnError: number;
    xbh: number;
    zones: Record<string, number>;
  }> = {};

  for (const pin of pins) {
    if (teamOfPin(pin) !== selectedTeam) continue;
    const player = canonicalPlayerName(pin.batter || 'Unknown');
    const result = pin.result || 'out';
    const zone = pin.zone || zoneByPoint(pin.x, pin.y);
    if (!reports[player]) {
      reports[player] = { player, pa: 0, ab: 0, hits: 0, walks: 0, strikeouts: 0, reachedOnError: 0, xbh: 0, zones: {} };
    }
    const report = reports[player];
    report.pa += 1;
    if (result !== 'walk') report.ab += 1;
    if (HIT_RESULTS.has(result)) report.hits += 1;
    if (result === 'walk') report.walks += 1;
    if (result === 'strikeout') report.strikeouts += 1;
    if (result === 'error') report.reachedOnError += 1;
    if (result === 'double' || result === 'triple' || result === 'home_run') report.xbh += 1;
    report.zones[zone] = (report.zones[zone] || 0) + 1;
  }

  return Object.values(reports).sort((a, b) => b.pa - a.pa || a.player.localeCompare(b.player));
}

function buildContactSummary(pins: StoredPin[], selectedTeam: TeamKey) {
  const teamPins = pins.filter((pin) => teamOfPin(pin) === selectedTeam);
  const hits = teamPins.filter((pin) => HIT_RESULTS.has(pin.result)).length;
  const outs = teamPins.filter((pin) => OUT_RESULTS.has(pin.result)).length;
  const reached = teamPins.filter((pin) => REACHED_RESULTS.has(pin.result)).length;
  const atBats = teamPins.filter((pin) => pin.result !== 'walk').length;
  const avg = atBats ? hits / atBats : 0;
  const obpDenominator = atBats + teamPins.filter((pin) => pin.result === 'walk').length;
  const obp = obpDenominator ? (hits + teamPins.filter((pin) => pin.result === 'walk').length) / obpDenominator : 0;
  return { pa: teamPins.length, hits, outs, reached, atBats, avg, obp };
}

function buildZoneReport(pins: StoredPin[], team: TeamKey) {
  const zoneStats = buildZoneStats(pins, team);
  return Object.entries(zoneStats)
    .map(([zone, stats]) => ({ zone, ...stats, total: stats.hits + stats.outs }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.hits - a.hits || b.total - a.total);
}

function formatRate(value: number): string {
  return value.toFixed(3).replace(/^0/, '');
}

function topZones(zones: Record<string, number>): string {
  const ranked = Object.entries(zones)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([zone, count]) => `${ZONE_LABELS[zone] || zone} ${count}`);
  return ranked.length ? ranked.join(', ') : '-';
}

function downloadBlob(filename: string, mime: string, content: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMarkdownExport(game: StoredGame, snapshot: DefenseSnapshot): string {
  const pins = game.pins || [];
  const score = game.score || snapshot.score;
  const opponentTeamName = game.opponentTeamName || snapshot.opponentTeamName || 'Opponents';
  const date = game.date ? toDateLabel(game.date) : toDateLabel(Date.now());
  const lines: string[] = [];
  lines.push(`# ${brandTeam.name} Game Summary — ${game.label || date}`);
  lines.push('');
  lines.push(`**Date:** ${date}`);
  lines.push(`**Score:** ${brandTeam.name} ${readScoreUs(score)} — ${opponentTeamName} ${score.opponents}`);
  lines.push(`**Total Plays Logged:** ${pins.length}`);
  lines.push('');

  if (snapshot.usLineup.length > 0) {
    lines.push(`## ${brandTeam.name} Lineup`);
    lines.push(snapshot.usLineup.map((p, i) => `${i + 1}. ${p}`).join('\n'));
    lines.push('');
  }

  if (snapshot.groups && snapshot.perInning) {
    lines.push('## Defensive Plan (Inning × Position)');
    lines.push('');
    const header = ['Position', ...Array.from({ length: PLANNED_INNINGS }, (_, i) => `I${i + 1}`)];
    lines.push(`| ${header.join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const spot of DEFENSE_SPOTS) {
      const row: string[] = [spot];
      for (let i = 1; i <= PLANNED_INNINGS; i++) {
        const group = groupForInning(snapshot.perInning, i);
        row.push(snapshot.groups?.[group]?.[spot] || '-');
      }
      lines.push(`| ${row.join(' | ')} |`);
    }
    lines.push('');
  }

  if (pins.length > 0) {
    lines.push('## Plays');
    lines.push('');
    lines.push('| # | Inning | Team | Batter | Result | Zone |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    pins.slice().reverse().forEach((p, idx) => {
      const team = toTeamAtBat(p.battingTeam);
      const zone = p.zone || zoneByPoint(p.x, p.y);
      lines.push(`| ${idx + 1} | ${p.inning ?? '-'} | ${team} | ${canonicalPlayerName(p.batter) || '-'} | ${p.result} | ${ZONE_LABELS[zone] || zone} |`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

function buildCsvExport(game: StoredGame): string {
  const pins = game.pins || [];
  const rows = [['id', 'inning', 'team', 'batter', 'result', 'zone', 'x', 'y']];
  for (const p of pins.slice().reverse()) {
    const team = toTeamAtBat(p.battingTeam);
    const zone = p.zone || zoneByPoint(p.x, p.y);
    rows.push([String(p.id), String(p.inning ?? ''), team, canonicalPlayerName(p.batter), p.result, zone, p.x.toFixed(2), p.y.toFixed(2)]);
  }
  return rows.map((r) => r.map((c) => (c.includes(',') || c.includes('"') ? `"${c.replaceAll('"', '""')}"` : c)).join(',')).join('\n');
}

function pinsToPlayEvents(pins: StoredPin[], selectedPlayer: string | null): PlayEvent[] {
  return pins
    .filter((p) => typeof p.x === 'number' && typeof p.y === 'number')
    .filter((p) => !selectedPlayer || canonicalPlayerName(p.batter || '') === selectedPlayer)
    .map((p, i) => ({
      id: String(p.id ?? i),
      batter: canonicalPlayerName(p.batter),
      battingTeam: toTeamAtBat(p.battingTeam),
      result: p.result as PlayEvent['result'],
      zone: (p.zone || 'center_field') as PlayEvent['zone'],
      x: p.x,
      y: p.y,
      inning: p.inning ?? 1,
      description: p.description,
    }));
}

export default function Dashboard() {
  const storageKeys = useCoachStorageKeys();
  const [selectedTeam, setSelectedTeam] = useState<TeamKey>('us');
  const [scope, setScope] = useState<Scope>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string>('all');

  const localGames = useMemo(
    () => loadGames(storageKeys.state, storageKeys.history),
    [storageKeys.state, storageKeys.history],
  );
  const [serverGames, setServerGames] = useState<StoredGame[]>([]);

  useEffect(() => {
    fetch('/api/coach/games')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.games)) {
          const localIds = new Set(localGames.map((g) => g.id));
          const newFromServer: StoredGame[] = data.games
            .filter((g: { id: string }) => !localIds.has(g.id))
            .map((g: { id: string; label?: string; date?: string; opponentTeamName?: string; score?: { us: number; opponents: number }; pinCount?: number; pins?: StoredPin[] }) => ({
              id: g.id,
              label: g.label,
              date: g.date,
              opponentTeamName: g.opponentTeamName,
              score: g.score,
              pins: Array.isArray(g.pins) ? g.pins : [],
            }));
          setServerGames(newFromServer);
        }
      })
      .catch(() => {});
  }, [localGames]);

  const games = useMemo(() => [...localGames, ...serverGames], [localGames, serverGames]);
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>(localGames.length ? [localGames[0].id] : []);

  const selectedGames = useMemo(() => {
    if (scope === 'all') return games;
    if (scope === 'current') return games.filter((g) => g.id === 'current');
    const selected = new Set(selectedGameIds);
    return games.filter((g) => selected.has(g.id));
  }, [games, scope, selectedGameIds]);
  const opponentTeamLabel = useMemo(() => {
    const names = new Set(
      selectedGames
        .map((game) => game.opponentTeamName?.trim())
        .filter((name): name is string => Boolean(name))
    );
    if (names.size === 1) return [...names][0];
    return 'Opponents';
  }, [selectedGames]);

  const scopedPins = useMemo(() => selectedGames.flatMap((g) => g.pins || []), [selectedGames]);
  const playerOptions = useMemo(() => {
    const values = new Set<string>();
    for (const pin of scopedPins) {
      const normalizedTeam = toTeamAtBat(pin.battingTeam);
      if (normalizedTeam !== selectedTeam) continue;
      const rawName = (pin.batter || '').trim();
      if (!rawName) continue;
      values.add(canonicalPlayerName(rawName));
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [scopedPins, selectedTeam]);
  const activePlayer = selectedPlayer !== 'all' && playerOptions.includes(selectedPlayer) ? selectedPlayer : null;

  const heatmapEvents = useMemo(
    () => pinsToPlayEvents(scopedPins, activePlayer),
    [scopedPins, activePlayer]
  );
  const selectedSummary = useMemo(() => buildContactSummary(scopedPins, selectedTeam), [scopedPins, selectedTeam]);
  const playerReports = useMemo(() => buildPlayerReports(scopedPins, selectedTeam), [scopedPins, selectedTeam]);
  const selectedZoneReport = useMemo(() => buildZoneReport(scopedPins, selectedTeam), [scopedPins, selectedTeam]);
  const opponentGapReport = useMemo(() => buildZoneReport(scopedPins, 'them'), [scopedPins]);

  const defenseSnapshot = useMemo(() => loadDefense(storageKeys.state), [storageKeys.state]);
  const inningGrid = useMemo(() => buildInningGrid(defenseSnapshot), [defenseSnapshot]);
  const fairness = useMemo(() => buildFairness(defenseSnapshot), [defenseSnapshot]);

  const onToggleGame = (gameId: string) => {
    setSelectedGameIds((prev) => (prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]));
  };

  const exportScopeGame = (): StoredGame => ({
    id: 'scope-export',
    label: `${brandTeam.name} vs ${opponentTeamLabel} (${scope === 'all' ? 'all games' : scope === 'current' ? 'current game' : 'selected games'})`,
    date: new Date().toISOString(),
    pins: scopedPins,
    score: defenseSnapshot.score,
    opponentTeamName: opponentTeamLabel,
  });

  const onExportMarkdown = () => {
    downloadBlob(`${brandTeam.slug}-game-summary.md`, 'text/markdown', buildMarkdownExport(exportScopeGame(), defenseSnapshot));
  };

  const onExportCsv = () => {
    downloadBlob(`${brandTeam.slug}-plays.csv`, 'text/csv', buildCsvExport(exportScopeGame()));
  };

  return (
    <div className="min-h-screen app-shell text-d-ink">
      <header className="border-b border-d-sel/40 bg-d-surface p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-d-sel">{brandTeam.name} Heat Map Dashboard</h1>
            <p className="mt-1 text-sm text-d-ink-2">Scope by current game, selected games, or all recorded games.</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link href="/coach" className="rounded-lg border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95">
              Back To Scoring
            </Link>
<Link href="/coach/import" className="rounded-lg border border-d-neg/40 bg-d-neg/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-neg touch-manipulation active:scale-95">
              Import Game
            </Link>
            <Link href="/coach/lineup" className="rounded-lg border border-d-pos/40 bg-d-pos/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-pos touch-manipulation active:scale-95">
              Lineup
            </Link>
            <Link href="/coach/intel" className="rounded-lg border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95">
              Intel
            </Link>
            <Link href="/coach/stats" className="rounded-lg border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95">
              Spray
            </Link>
            <button onClick={onExportMarkdown} className="rounded-lg border border-d-sel/40 bg-d-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95">
              Export MD
            </button>
            <button onClick={onExportCsv} className="rounded-lg border border-d-sel/40 bg-d-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95">
              Export CSV
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-d-line bg-d-surface p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-d-ink-2">Team View</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-lg border px-3 py-2 text-sm font-semibold touch-manipulation active:scale-95 ${selectedTeam === 'us' ? 'border-d-pos bg-d-pos text-white' : 'border-d-line bg-d-sunken text-d-ink'}`}
                onClick={() => setSelectedTeam('us')}
              >
                {brandTeam.name}
              </button>
              <button
                className={`rounded-lg border px-3 py-2 text-sm font-semibold touch-manipulation active:scale-95 ${selectedTeam === 'them' ? 'border-d-neg bg-d-neg text-white' : 'border-d-line bg-d-sunken text-d-ink'}`}
                onClick={() => setSelectedTeam('them')}
              >
                {opponentTeamLabel}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-d-line bg-d-surface p-4 md:col-span-2">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-d-ink-2">Game Scope</h2>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(['current', 'multiple', 'all'] as Scope[]).map((value) => (
                <button
                  key={value}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold touch-manipulation active:scale-95 capitalize ${scope === value ? 'border-d-sel bg-d-sel text-white' : 'border-d-line bg-d-sunken text-d-ink'}`}
                  onClick={() => setScope(value)}
                >
                  {value === 'current' ? 'Current Game' : value === 'multiple' ? 'Selected Games' : 'All Games'}
                </button>
              ))}
            </div>

            {scope === 'multiple' && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-d-line bg-d-surface p-3 sm:grid-cols-2">
                {games.map((game) => (
                  <label key={game.id} className="flex items-center gap-2 text-sm text-d-ink">
                    <input type="checkbox" checked={selectedGameIds.includes(game.id)} onChange={() => onToggleGame(game.id)} />
                    <span>{game.label || game.id}</span>
                    <span className="text-xs text-d-ink-3">({(game.pins || []).length} events)</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-d-line bg-d-surface p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-d-ink-2">Player Focus</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-d-ink-2" htmlFor="player-filter">
              Batter:
            </label>
            <select
              id="player-filter"
              className="rounded-lg border border-d-line bg-d-sunken px-3 py-2 text-sm text-d-ink"
              value={selectedPlayer}
              onChange={(e) => setSelectedPlayer(e.target.value)}
            >
              <option value="all">All batters ({selectedTeam === 'us' ? brandTeam.name : opponentTeamLabel})</option>
              {playerOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <span className="text-xs text-d-ink-3">
              Showing {activePlayer ? activePlayer : 'all players'} in current scope.
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-d-line bg-d-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-d-ink-2">Field Heat Map</h2>
          <HeatmapCanvas events={heatmapEvents} visualStyle="classic" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="rounded-xl border border-d-line bg-d-surface p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Team Contact Report</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Metric label="PA" value={String(selectedSummary.pa)} />
              <Metric label="Hits" value={String(selectedSummary.hits)} />
              <Metric label="AVG" value={formatRate(selectedSummary.avg)} />
              <Metric label="OBP" value={formatRate(selectedSummary.obp)} />
              <Metric label="Reached" value={String(selectedSummary.reached)} />
              <Metric label="Outs Logged" value={String(selectedSummary.outs)} />
            </div>
            <p className="mt-3 text-xs text-d-ink-3">
              Historical imports use estimated field coordinates when notes only say things like LC, up middle, or down 3B line.
            </p>
          </section>

          <section className="rounded-xl border border-d-line bg-d-surface p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Where Balls Are Finding Grass</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ZoneList title={selectedTeam === 'us' ? `${brandTeam.name} Contact` : `${opponentTeamLabel} Contact`} rows={selectedZoneReport} />
              <ZoneList title="Defensive Gap Watch" rows={opponentGapReport} />
            </div>
          </section>
        </div>

        <section className="rounded-xl border border-d-line bg-d-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Defensive Plan &amp; Playing Time</h2>
          <p className="mt-1 text-xs text-d-ink-3">Current game&apos;s inning-by-inning defense and bench fairness (from Game Setup).</p>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-d-ink">
                <thead className="border-b border-d-line text-d-ink-3">
                  <tr>
                    <th className="py-2 pr-3">Pos</th>
                    {Array.from({ length: PLANNED_INNINGS }, (_, i) => (
                      <th key={`gi-h-${i + 1}`} className="py-2 pr-3 text-center">I{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inningGrid.map((row) => (
                    <tr key={`grid-${row.spot}`} className="border-b border-d-line">
                      <td className="py-2 pr-3 font-semibold text-d-sel">{row.spot}</td>
                      {row.cells.map((cell) => (
                        <td key={`grid-${row.spot}-${cell.inning}`} className={`py-2 pr-3 text-center ${cell.player ? '' : 'text-d-ink-3'}`}>
                          {cell.player || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-d-ink-3">Bench Fairness (innings benched)</h3>
              <ul className="mt-2 space-y-1 text-xs text-d-ink">
                {fairness.map((f) => {
                  const bench = f.counts.BENCH || 0;
                  const field = Object.entries(f.counts).reduce((sum, [spot, n]) => (spot === 'BENCH' ? sum : sum + n), 0);
                  return (
                    <li key={`fair-${f.player}`} className="flex items-center justify-between gap-3 rounded border border-d-line bg-d-surface px-3 py-1.5">
                      <span className="font-medium text-d-ink">{f.player}</span>
                      <span className="text-d-ink-3 tabular-nums">
                        <span className="text-d-pos">{field}</span> in field / <span className={bench > 1 ? 'text-d-warn' : 'text-d-ink-3'}>{bench}</span> benched
                      </span>
                    </li>
                  );
                })}
                {fairness.length === 0 && <li className="text-d-ink-3">No defense plan set for the current game yet.</li>}
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-d-line bg-d-surface p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-d-ink-2">Player Hitting Report</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-d-ink">
              <thead className="border-b border-d-line text-d-ink-3">
                <tr>
                  <th className="py-2 pr-3">Player</th>
                  <th className="py-2 pr-3">PA</th>
                  <th className="py-2 pr-3">AB</th>
                  <th className="py-2 pr-3">H</th>
                  <th className="py-2 pr-3">XBH</th>
                  <th className="py-2 pr-3">K</th>
                  <th className="py-2 pr-3">ROE</th>
                  <th className="py-2 pr-3">AVG</th>
                  <th className="py-2 pr-3">OBP</th>
                  <th className="py-2 pr-3">Main Contact</th>
                </tr>
              </thead>
              <tbody>
                {playerReports.map((row) => {
                  const avg = row.ab ? row.hits / row.ab : 0;
                  const obpDenominator = row.ab + row.walks;
                  const obp = obpDenominator ? (row.hits + row.walks) / obpDenominator : 0;
                  return (
                    <tr key={row.player} className="border-b border-d-line">
                      <td className="py-2 pr-3 font-semibold text-d-sel">{row.player}</td>
                      <td className="py-2 pr-3">{row.pa}</td>
                      <td className="py-2 pr-3">{row.ab}</td>
                      <td className="py-2 pr-3">{row.hits}</td>
                      <td className="py-2 pr-3">{row.xbh}</td>
                      <td className="py-2 pr-3">{row.strikeouts}</td>
                      <td className="py-2 pr-3">{row.reachedOnError}</td>
                      <td className="py-2 pr-3">{formatRate(avg)}</td>
                      <td className="py-2 pr-3">{formatRate(obp)}</td>
                      <td className="py-2 pr-3">{topZones(row.zones)}</td>
                    </tr>
                  );
                })}
                {playerReports.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-4 text-center text-d-ink-3">No player events in this scope.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-d-line bg-d-surface p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-d-ink-3">{label}</div>
      <div className="mt-1 text-lg font-black text-d-sel">{value}</div>
    </div>
  );
}

function ZoneList({ title, rows }: { title: string; rows: Array<{ zone: string; hits: number; outs: number; total: number }> }) {
  return (
    <div className="rounded-lg border border-d-line bg-d-surface p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-d-ink-3">{title}</h3>
      <ul className="mt-2 space-y-1 text-xs text-d-ink">
        {rows.slice(0, 7).map((row) => (
          <li key={row.zone} className="flex items-center justify-between gap-3">
            <span>{ZONE_LABELS[row.zone] || row.zone}</span>
            <span className="text-d-ink-3">
              <span className="font-semibold text-d-pos">{row.hits}</span> hits / {row.total} contacts
            </span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-d-ink-3">No contact yet.</li>}
      </ul>
    </div>
  );
}
