"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { isDatabaseSyncEnabled, syncGameToDatabase } from "@/lib/coach/db-sync";
import type { Bases, EventPin, FieldZone, GameEventV2, PlayResult, TeamAtBat } from "@/lib/coach/game-types";
import { canonicalPlayerName } from "@/lib/coach/player-name";

type FieldPointerEvent = React.PointerEvent<HTMLDivElement>;
type DefenseGroupName = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type GameFormat = "coach_pitch" | "kid_pitch";
type PitchOutcome = "ball" | "called_strike" | "swinging_strike" | "foul" | "in_play";
type ContactType = "Ground Ball" | "Hard Ground Ball" | "Fly Ball" | "Line Drive" | "Bunt" | "Pop Fly";
type ScoringStep = "idle" | "contact" | "advance";
type RunOverride = number | null;

type DefenseAssignments = Record<string, string>;
type DefenseGroups = Record<DefenseGroupName, DefenseAssignments>;

type SavedGameState = {
  inning: number;
  outs: number;
  ourRuns: number;
  oppRuns: number;
  batter: string;
  oppBatter: string;
  selectedResult: PlayResult;
  pins: EventPin[];
  teamAtBat: TeamAtBat;
  outlawsLineup: string[];
  opponentsLineup: string[];
  defenseGroups: DefenseGroups;
  inningDefenseGroup: Record<number, DefenseGroupName>;
  bases: Bases;
  opponentTeamName: string;
  outlawsAreHome: boolean;
  gameFormat: GameFormat;
  eventsV2: GameEventV2[];
};

const EMPTY_BASES: Bases = { first: null, second: null, third: null };

const FIELD_DOT_POSITIONS = {
  H: { x: 50, y: 84 },
  P: { x: 50, y: 57 },
  "3B": { x: 30, y: 55 },
  "1B": { x: 70, y: 55 },
  SS: { x: 34, y: 32 },
  "2B": { x: 66, y: 32 },
  LF: { x: 15, y: 20 },
  LCF: { x: 34, y: 14 },
  CF: { x: 50, y: 14 },
  RCF: { x: 66, y: 14 },
  RF: { x: 85, y: 20 },
} as const;

function applyPlay(result: PlayResult, batter: string, current: Bases): { next: Bases; runs: number } {
  let { first, second, third } = current;
  let runs = 0;
  switch (result) {
    case "single":
      if (third) { runs++; third = null; }
      if (second) { third = second; second = null; }
      if (first) { second = first; first = null; }
      first = batter;
      break;
    case "double":
      if (third) { runs++; third = null; }
      if (second) { runs++; second = null; }
      if (first) { third = first; first = null; }
      second = batter;
      break;
    case "triple":
      if (third) { runs++; third = null; }
      if (second) { runs++; second = null; }
      if (first) { runs++; first = null; }
      third = batter;
      break;
    case "home_run":
      if (third) runs++;
      if (second) runs++;
      if (first) runs++;
      runs++;
      first = null; second = null; third = null;
      break;
    case "error":
      if (first) { second = first; first = null; }
      first = batter;
      break;
    case "fielders_choice":
      if (first) first = null;
      first = batter;
      break;
    case "out":
    case "strikeout":
    case "foul":
    default:
      break;
    case "walk":
      if (first && second && third) {
        runs++;
      } else if (first && second) {
        third = second;
        second = first;
      } else if (first) {
        second = first;
      }
      first = batter;
      break;
  }
  return { next: { first, second, third }, runs };
}

type SavedGameHistory = {
  id: string;
  label: string;
  date: string;
  pins: EventPin[];
  eventsV2?: GameEventV2[];
  schemaVersion?: number;
  score: { outlaws: number; opponents: number };
  opponentTeamName?: string;
  outlawsAreHome?: boolean;
};

type GameSnapshot = {
  inning: number;
  outs: number;
  ourRuns: number;
  oppRuns: number;
  balls: number;
  strikes: number;
  batter: string;
  oppBatter: string;
  selectedResult: PlayResult;
  pins: EventPin[];
  teamAtBat: TeamAtBat;
  bases: Bases;
};

const STORAGE_KEY = "outlaws-field-app:v1";
const HISTORY_KEY = "outlaws-field-app:games:v1";

const DEFAULT_OUTLAWS_LINEUP = ["#00", "#3", "#6", "#11", "#15", "#18", "#20", "#22", "#31", "#41", "#99"];
// Start empty: opponent lineups are rarely known pre-game, so live-add builds the
// order from spot 1 instead of appending to placeholder junk numbers.
const DEFAULT_OPPONENTS_LINEUP: string[] = [];
const DEFENSE_GROUPS: DefenseGroupName[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const CONTACT_TYPES: ContactType[] = ["Ground Ball", "Hard Ground Ball", "Fly Ball", "Line Drive", "Bunt", "Pop Fly"];
const QUICK_RESULTS: PlayResult[] = ["single", "double", "triple", "home_run", "out", "error", "fielders_choice"];
const RUN_OVERRIDE_OPTIONS: RunOverride[] = [null, 0, 1, 2, 3, 4];

const DEFENSE_SPOTS_COACH_PITCH: Array<{ code: string; label: string }> = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "LCF", label: "Left Center" },
  { code: "RCF", label: "Right Center" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];

const DEFENSE_SPOTS_KID_PITCH: Array<{ code: string; label: string }> = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "CF", label: "Center Field" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];

const ALL_DEFENSE_SPOTS: Array<{ code: string; label: string }> = [
  { code: "P", label: "Pitcher" },
  { code: "C", label: "Catcher" },
  { code: "1B", label: "1st Base" },
  { code: "2B", label: "2nd Base" },
  { code: "3B", label: "3rd Base" },
  { code: "SS", label: "Shortstop" },
  { code: "LF", label: "Left Field" },
  { code: "LCF", label: "Left Center" },
  { code: "CF", label: "Center Field" },
  { code: "RCF", label: "Right Center" },
  { code: "RF", label: "Right Field" },
  { code: "BENCH", label: "Bench" },
];

const MAX_LINEUP_PLAYERS = 20;

// Sentinel <option> value for the defense picker's "＋ new player" escape
// hatch. Deliberately a string no player name can collide with, since the
// select's values are player names.
const NEW_PLAYER_OPTION = "__new_player__";

const getDefenseSpotsForFormat = (format: GameFormat) =>
  format === "kid_pitch" ? DEFENSE_SPOTS_KID_PITCH : DEFENSE_SPOTS_COACH_PITCH;

const nextLineupPlayer = (lineup: string[], current: string): string => {
  if (lineup.length === 0) return current;
  const currentIndex = lineup.indexOf(current);
  if (currentIndex === -1) return lineup[0];
  return lineup[(currentIndex + 1) % lineup.length];
};

const defaultResultForContact = (contact: ContactType): PlayResult => {
  if (contact === "Fly Ball" || contact === "Pop Fly" || contact === "Bunt") return "out";
  return "single";
};

const makeBlankDefense = (): DefenseAssignments => {
  const next: DefenseAssignments = {};
  for (const spot of ALL_DEFENSE_SPOTS) next[spot.code] = "";
  return next;
};

const DEFAULT_DEFENSE_GROUPS: DefenseGroups = {
  A1: { ...makeBlankDefense(), SS: "Jack", "1B": "Linc", BENCH: "Kellen" },
  A2: { ...makeBlankDefense(), SS: "Jack", "1B": "Linc", BENCH: "Aiden" },
  B1: makeBlankDefense(),
  B2: makeBlankDefense(),
  C1: makeBlankDefense(),
  C2: makeBlankDefense(),
};

const DEFAULT_INNING_DEFENSE_GROUP: Record<number, DefenseGroupName> = {
  1: "A1",
  2: "A2",
  3: "B1",
  4: "B2",
  5: "C1",
  6: "C2",
};

const zoneByPoint = (x: number, y: number): FieldZone => {
  if (y > 78) {
    if (x < 43) return "third_base";
    if (x > 57) return "first_base";
    return "catcher_zone";
  }
  if (y > 64) {
    if (x < 44) return "shortstop";
    if (x > 56) return "second_base";
    return "pitcher_zone";
  }
  if (x < 30) return "left_field";
  if (x < 44) return "left_center";
  if (x <= 56) return "center_field";
  if (x <= 70) return "right_center";
  return "right_field";
};

const resultStyles: Record<PlayResult, string> = {
  single: "bg-emerald-100 text-emerald-800 border-emerald-300",
  double: "bg-green-100 text-green-800 border-green-300",
  triple: "bg-lime-100 text-lime-800 border-lime-300",
  home_run: "bg-yellow-100 text-yellow-800 border-yellow-300",
  out: "bg-rose-100 text-rose-800 border-rose-300",
  error: "bg-orange-100 text-orange-800 border-orange-300",
  fielders_choice: "bg-sky-100 text-sky-800 border-sky-300",
  walk: "bg-indigo-100 text-indigo-800 border-indigo-300",
  strikeout: "bg-red-200 text-red-900 border-red-400",
  foul: "bg-zinc-200 text-zinc-900 border-zinc-400",
};

const resultLabel: Record<PlayResult, string> = {
  single: "1B",
  double: "2B",
  triple: "3B",
  home_run: "HR",
  out: "OUT",
  error: "E",
  fielders_choice: "FC",
  walk: "BB",
  strikeout: "K",
  foul: "F",
};

function makeV2Event(params: {
  pin: EventPin;
  description: string;
  outsAfter: number;
  outlawsRunsAfter: number;
  opponentRunsAfter: number;
  basesAfter: Bases;
}): GameEventV2 {
  return {
    id: `evt-${params.pin.id}`,
    eventType: "ball_in_play",
    timestamp: new Date().toISOString(),
    inning: params.pin.inning,
    batter: params.pin.batter,
    battingTeam: params.pin.battingTeam,
    result: params.pin.result,
    zone: params.pin.zone,
    x: params.pin.x,
    y: params.pin.y,
    description: params.description,
    stateAfter: {
      outs: params.outsAfter,
      outlawsRuns: params.outlawsRunsAfter,
      opponentRuns: params.opponentRunsAfter,
      bases: params.basesAfter,
    },
  };
}

export default function Home() {
  const saved = readSavedGameState();

  const [inning, setInning] = useState(typeof saved.inning === "number" ? saved.inning : 1);
  const [outs, setOuts] = useState(typeof saved.outs === "number" ? saved.outs : 0);
  const [ourRuns, setOurRuns] = useState(typeof saved.ourRuns === "number" ? saved.ourRuns : 0);
  const [oppRuns, setOppRuns] = useState(typeof saved.oppRuns === "number" ? saved.oppRuns : 0);
  const [balls, setBalls] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [outlawsLineup, setOutlawsLineup] = useState<string[]>(saved.outlawsLineup || DEFAULT_OUTLAWS_LINEUP);
  const [opponentsLineup, setOpponentsLineup] = useState<string[]>(saved.opponentsLineup || DEFAULT_OPPONENTS_LINEUP);
  const [defenseGroups, setDefenseGroups] = useState<DefenseGroups>(saved.defenseGroups || DEFAULT_DEFENSE_GROUPS);
  const [inningDefenseGroup, setInningDefenseGroup] = useState<Record<number, DefenseGroupName>>(saved.inningDefenseGroup || DEFAULT_INNING_DEFENSE_GROUP);
  const [setupGroup, setSetupGroup] = useState<DefenseGroupName>("A1");
  const [showSetup, setShowSetup] = useState(false);
  const setupRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (showSetup) setupRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showSetup]);
  const [gameFormat, setGameFormat] = useState<GameFormat>(saved.gameFormat || "coach_pitch");
  const [outlawsAreHome, setOutlawsAreHome] = useState<boolean>(saved.outlawsAreHome ?? false);
  const [teamAtBat, setTeamAtBat] = useState<TeamAtBat>(
    saved.teamAtBat || ((saved.outlawsAreHome ?? false) ? "opponent" : "outlaws"),
  );
  const [batter, setBatter] = useState(saved.batter || (saved.outlawsLineup?.[0] ?? DEFAULT_OUTLAWS_LINEUP[0]));
  const [oppBatter, setOppBatter] = useState(saved.oppBatter || saved.opponentsLineup?.[0] || "");
  const [selectedResult, setSelectedResult] = useState<PlayResult>(saved.selectedResult || "single");
  const [pins, setPins] = useState<EventPin[]>(Array.isArray(saved.pins) ? saved.pins : []);
  const [bases, setBases] = useState<Bases>(saved.bases || EMPTY_BASES);
  const [lastPlay, setLastPlay] = useState("");
  const [opponentTeamName, setOpponentTeamName] = useState(saved.opponentTeamName ?? "");
  const [isTestMode, setIsTestMode] = useState(false);
  const [undoStack, setUndoStack] = useState<GameSnapshot[]>([]);
  const [eventLog, setEventLog] = useState<GameEventV2[]>(Array.isArray(saved.eventsV2) ? saved.eventsV2 : []);
  const [lastSavedGameId, setLastSavedGameId] = useState<string | null>(null);
  const [shareSyncStatus, setShareSyncStatus] = useState<string | null>(null);
  const [scoringStep, setScoringStep] = useState<ScoringStep>("idle");
  const [pendingContact, setPendingContact] = useState<ContactType | null>(null);
  const [runOverride, setRunOverride] = useState<RunOverride>(null);

  // Display-safe opponent name (state can be empty while typing).
  const opponentLabel = opponentTeamName.trim() || "Opponents";
  // Home/away: the away team always bats first (top of the inning).
  const awayTeam: TeamAtBat = outlawsAreHome ? "opponent" : "outlaws";
  const homeTeam: TeamAtBat = outlawsAreHome ? "outlaws" : "opponent";
  const teamLabel = (t: TeamAtBat) => (t === "outlaws" ? "Outlaws" : opponentLabel);
  const halfLabel = (t: TeamAtBat) => (t === awayTeam ? "Top" : "Bottom");

  // Flip home/away before any plays are logged: move the leadoff team so the
  // change is immediately visible (away team bats first).
  const toggleOutlawsHome = (nextHome: boolean) => {
    setOutlawsAreHome(nextHome);
    if (pins.length === 0) {
      setTeamAtBat(nextHome ? "opponent" : "outlaws");
    }
  };

  const activeLineup = teamAtBat === "outlaws" ? outlawsLineup : opponentsLineup;
  const activeBatter = teamAtBat === "outlaws" ? batter : oppBatter;
  const currentDefenseGroup = getDefenseGroupForInning(inningDefenseGroup, inning);
  const currentDefense = defenseGroups[currentDefenseGroup] || makeBlankDefense();
  const activeDefenseSpots = getDefenseSpotsForFormat(gameFormat);

  // Roster options for the defense-spot picker — fixes B4 (MERGE-PLAN.md §0.3).
  // The spot editor was a free-text <input placeholder="Player name">, so every
  // assignment was a fresh chance to type a name the rest of the app had never
  // seen. That is structurally how "Linc" and "Lincoln" became two players.
  //
  // Source is local state, not the database: `public.players` exists only in
  // the unapplied migration 001. This is a validation fix and does not wait on
  // the schema.
  //
  // The union is required, not defensive. `outlawsLineup` holds jersey numbers
  // ("#00", "#3", …) while `defenseGroups` holds names ("Jack", "Linc") — that
  // mismatch is B5, and the two sets do not intersect on a default install.
  // Offering only the lineup would make every existing assignment an
  // unrepresentable value and blank the grid on first render. Mirrors
  // rosterFromPlan() in @/lib/coach/lineup.
  const defenseRosterOptions = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const raw of outlawsLineup) {
      const name = canonicalPlayerName(raw);
      if (!name || name === "Unknown" || seen.has(name)) continue;
      seen.add(name);
      ordered.push(name);
    }
    const extras = new Set<string>();
    for (const group of DEFENSE_GROUPS) {
      const assignments = defenseGroups[group];
      if (!assignments) continue;
      for (const code of Object.keys(assignments)) {
        const name = canonicalPlayerName(assignments[code] || "");
        if (!name || name === "Unknown" || seen.has(name)) continue;
        extras.add(name);
      }
    }
    return [...ordered, ...[...extras].sort((a, b) => a.localeCompare(b))];
  }, [outlawsLineup, defenseGroups]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const next: SavedGameState = {
      inning,
      outs,
      ourRuns,
      oppRuns,
      batter,
      oppBatter,
      selectedResult,
      pins,
      teamAtBat,
      outlawsLineup,
      opponentsLineup,
      defenseGroups,
      inningDefenseGroup,
      bases,
      opponentTeamName,
      outlawsAreHome,
      gameFormat,
      eventsV2: eventLog,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [inning, outs, ourRuns, oppRuns, batter, oppBatter, selectedResult, pins, teamAtBat, outlawsLineup, opponentsLineup, defenseGroups, inningDefenseGroup, bases, opponentTeamName, outlawsAreHome, gameFormat, eventLog]);

  const summary = useMemo(() => {
    const outCount = pins.filter((p) => p.result === "out" || p.result === "strikeout" || p.result === "fielders_choice").length;
    const hits = pins.filter((p) => ["single", "double", "triple", "home_run"].includes(p.result)).length;
    return { outCount, hits, total: pins.length };
  }, [pins]);

  const linescore = useMemo(() => {
    const events = [...eventLog].reverse();
    const innings = new Map<number, { outlaws: number; opponent: number }>();
    let prevOutlaws = 0;
    let prevOpp = 0;
    for (const event of events) {
      const prior = innings.get(event.inning) || { outlaws: 0, opponent: 0 };
      const dOutlaws = Math.max(0, event.stateAfter.outlawsRuns - prevOutlaws);
      const dOpp = Math.max(0, event.stateAfter.opponentRuns - prevOpp);
      innings.set(event.inning, { outlaws: prior.outlaws + dOutlaws, opponent: prior.opponent + dOpp });
      prevOutlaws = event.stateAfter.outlawsRuns;
      prevOpp = event.stateAfter.opponentRuns;
    }
    return Array.from(innings.entries()).sort((a, b) => a[0] - b[0]);
  }, [eventLog]);

  const boxScore = useMemo(() => {
    const byBatter: Record<string, { PA: number; AB: number; H: number; BB: number; K: number; R: number }> = {};
    for (const event of eventLog.filter((e) => e.battingTeam === "outlaws" && e.eventType === "ball_in_play")) {
      const name = canonicalPlayerName(event.batter || "Unknown");
      if (!byBatter[name]) byBatter[name] = { PA: 0, AB: 0, H: 0, BB: 0, K: 0, R: 0 };
      byBatter[name].PA += 1;
      if (["single", "double", "triple", "home_run", "out", "error", "fielders_choice", "strikeout", "foul"].includes(event.result)) byBatter[name].AB += 1;
      if (["single", "double", "triple", "home_run"].includes(event.result)) byBatter[name].H += 1;
      if (event.result === "walk") byBatter[name].BB += 1;
      if (event.result === "strikeout") byBatter[name].K += 1;
    }
    return Object.entries(byBatter).sort((a, b) => a[0].localeCompare(b[0]));
  }, [eventLog]);

  const applyResolvedPlay = (
    result: PlayResult,
    zone: FieldZone,
    x: number,
    y: number,
    customDescription?: string,
    options?: { ignoreRunOverride?: boolean },
  ) => {
    const snapshot: GameSnapshot = {
      inning,
      outs,
      ourRuns,
      oppRuns,
      balls,
      strikes,
      batter,
      oppBatter,
      selectedResult,
      pins,
      teamAtBat,
      bases,
    };
    setUndoStack((prev) => [snapshot, ...prev].slice(0, 40));

    const next: EventPin = {
      id: Date.now(),
      batter: activeBatter,
      result,
      zone,
      x,
      y,
      inning,
      battingTeam: teamAtBat,
    };
    setPins((previous) => [next, ...previous]);

    const isOut = result === "out" || result === "fielders_choice" || result === "strikeout";
    const { next: nextBases, runs: autoRuns } = applyPlay(result, activeBatter, bases);
    const runs = options?.ignoreRunOverride ? autoRuns : runOverride ?? autoRuns;
    let nextOuts = outs;
    let nextInning = inning;
    let nextTeamAtBat = teamAtBat;

    if (isOut) {
      if (outs >= 2) {
        setOuts(0);
        setBases(EMPTY_BASES);
        nextOuts = 0;
        if (teamAtBat === awayTeam) {
          // Away team retired → home team bats (bottom), same inning.
          setTeamAtBat(homeTeam);
          nextTeamAtBat = homeTeam;
        } else {
          // Home team retired → next inning, away team leads off again.
          setTeamAtBat(awayTeam);
          setInning((prev) => prev + 1);
          nextTeamAtBat = awayTeam;
          nextInning = inning + 1;
        }
      } else {
        setOuts(outs + 1);
        setBases(nextBases);
        nextOuts = outs + 1;
      }
    } else {
      setBases(nextBases);
    }

    const nextOutlawsRuns = teamAtBat === "outlaws" ? ourRuns + runs : ourRuns;
    const nextOpponentRuns = teamAtBat === "opponent" ? oppRuns + runs : oppRuns;
    if (runs > 0) {
      if (teamAtBat === "outlaws") setOurRuns((v) => v + runs);
      else setOppRuns((v) => v + runs);
    }

    const basesAfter = isOut && outs >= 2 ? EMPTY_BASES : nextBases;
    const runsNote = runs > 0 ? ` (+${runs} run${runs === 1 ? "" : "s"})` : "";
    const baseDescription = customDescription || `${activeBatter}: ${resultLabel[result]} to ${zone.replaceAll("_", " ")} (${teamLabel(teamAtBat)})`;
    const description = `${baseDescription}${runsNote}`;
    setLastPlay(description);
    setBalls(0);
    setStrikes(0);
    if (teamAtBat === "outlaws") {
      setBatter((current) => nextLineupPlayer(outlawsLineup, current));
    } else {
      setOppBatter((current) => nextLineupPlayer(opponentsLineup, current));
    }
    setEventLog((prev) => [
      makeV2Event({
        pin: next,
        description,
        outsAfter: nextOuts,
        outlawsRunsAfter: nextOutlawsRuns,
        opponentRunsAfter: nextOpponentRuns,
        basesAfter,
      }),
      ...prev,
    ]);
    if (isOut && outs >= 2) {
      setLastPlay(`${description} · Side retired. ${halfLabel(nextTeamAtBat)} ${nextInning}: ${teamLabel(nextTeamAtBat)} batting.`);
    }
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
  };

  const handlePitch = (outcome: PitchOutcome) => {
    if (outcome === "in_play") {
      // Go straight to field placement. Result defaults to single and can be
      // overridden in the panel; contact type is an optional tag, not a gate.
      setScoringStep("advance");
      setSelectedResult("single");
      setPendingContact(null);
      setRunOverride(null);
      setLastPlay(`Ball in play to ${activeBatter}. Tap where it was fielded.`);
      return;
    }

    let nextBalls = balls;
    let nextStrikes = strikes;
    if (outcome === "ball") nextBalls = Math.min(4, balls + 1);
    if (outcome === "called_strike" || outcome === "swinging_strike") nextStrikes = Math.min(3, strikes + 1);
    if (outcome === "foul") nextStrikes = strikes >= 2 ? 2 : strikes + 1;

    if (nextBalls >= 4) {
      applyResolvedPlay("walk", "pitcher_zone", 50, 65, `${activeBatter}: BB (auto from 4 balls)`, { ignoreRunOverride: true });
      return;
    }
    if (nextStrikes >= 3) {
      applyResolvedPlay("strikeout", "catcher_zone", 50, 83, `${activeBatter}: K (auto from 3 strikes)`, { ignoreRunOverride: true });
      return;
    }

    setBalls(nextBalls);
    setStrikes(nextStrikes);
    setLastPlay(`${activeBatter}: ${outcome.replaceAll("_", " ")} · Count ${nextBalls}-${nextStrikes}`);
    setEventLog((prev) => [
      {
        id: `pitch-${Date.now()}`,
        eventType: "pitch",
        timestamp: new Date().toISOString(),
        inning,
        batter: activeBatter,
        battingTeam: teamAtBat,
        result: selectedResult,
        zone: "pitcher_zone",
        x: 50,
        y: 65,
        pitchOutcome: outcome,
        countAfter: { balls: nextBalls, strikes: nextStrikes },
        description: `${activeBatter}: ${outcome.replaceAll("_", " ")} (${nextBalls}-${nextStrikes})`,
        stateAfter: {
          outs,
          outlawsRuns: ourRuns,
          opponentRuns: oppRuns,
          bases,
        },
      },
      ...prev,
    ]);
  };

  const onFieldTap = (event: FieldPointerEvent) => {
    event.preventDefault();
    if (scoringStep !== "advance") {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.clientX;
    const clientY = event.clientY;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    const zone = zoneByPoint(x, y);
    const contactPrefix = pendingContact ? `${pendingContact} · ` : "";
    const description = pendingContact
      ? `${activeBatter}: ${contactPrefix}${resultLabel[selectedResult]} to ${zone.replaceAll("_", " ")} (${teamLabel(teamAtBat)})`
      : undefined;
    applyResolvedPlay(selectedResult, zone, x, y, description);
  };

  const handleContactSelect = (contact: ContactType) => {
    // Optional tag while placing the hit. Toggling sets a sensible default result
    // (fly/pop/bunt -> out) but the result chips still win if tapped after.
    const next = pendingContact === contact ? null : contact;
    setPendingContact(next);
    if (next) setSelectedResult(defaultResultForContact(next));
    setLastPlay(next ? `${activeBatter}: ${next} tagged. Tap where it was fielded.` : `${activeBatter}: contact tag cleared.`);
  };

  const cancelScoringFlow = () => {
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
    setLastPlay("Cancelled ball-in-play scoring.");
  };

  const saveCurrentGameToHistory = () => {
    if (typeof window === "undefined" || pins.length === 0) return;
    const existing: SavedGameHistory[] = readSavedHistory();
    const stamp = new Date();
    const entry: SavedGameHistory = {
      id: `game-${stamp.getTime()}`,
      label: `${stamp.toLocaleDateString()} vs ${opponentLabel} Game ${existing.length + 1}`,
      date: stamp.toISOString(),
      pins,
      eventsV2: eventLog,
      schemaVersion: 2,
      score: { outlaws: ourRuns, opponents: oppRuns },
      opponentTeamName: opponentLabel,
      outlawsAreHome,
    };
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...existing]));
    setLastSavedGameId(null);
    if (isDatabaseSyncEnabled()) {
      setShareSyncStatus("Syncing read-only share link...");
      void syncGameToDatabase(entry).then((result) => {
        if (result.ok) {
          setLastSavedGameId(result.gameId || entry.id);
          setShareSyncStatus(`Share link ready (${result.syncedEvents ?? eventLog.length} events synced).`);
        } else {
          setShareSyncStatus(`Saved locally. Share link not ready: ${result.error || "sync failed"}.`);
        }
      });
    } else {
      setShareSyncStatus("Saved locally. Database sync is disabled, so no share link was created.");
    }
  };

  const resetGame = () => {
    saveCurrentGameToHistory();
    setPins([]);
    setOurRuns(0);
    setOppRuns(0);
    setInning(1);
    setOuts(0);
    setTeamAtBat(outlawsAreHome ? "opponent" : "outlaws");
    setBatter(outlawsLineup[0] ?? "#00");
    setOppBatter(opponentsLineup[0] ?? "");
    setSelectedResult("single");
    setBases(EMPTY_BASES);
    setBalls(0);
    setStrikes(0);
    setLastPlay("Saved game to history and reset scoreboard.");
    setUndoStack([]);
    setEventLog([]);
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
  };

  const clearCurrentGameNoSave = () => {
    setPins([]);
    setOurRuns(0);
    setOppRuns(0);
    setInning(1);
    setOuts(0);
    setTeamAtBat(outlawsAreHome ? "opponent" : "outlaws");
    setBatter(outlawsLineup[0] ?? "#00");
    setOppBatter(opponentsLineup[0] ?? "");
    setSelectedResult("single");
    setBases(EMPTY_BASES);
    setBalls(0);
    setStrikes(0);
    setLastPlay("Cleared current game (not saved to history).");
    setUndoStack([]);
    setEventLog([]);
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
  };

  const undoLastAction = () => {
    if (undoStack.length === 0) return;
    const [previous, ...rest] = undoStack;
    setInning(previous.inning);
    setOuts(previous.outs);
    setOurRuns(previous.ourRuns);
    setOppRuns(previous.oppRuns);
    setBalls(previous.balls);
    setStrikes(previous.strikes);
    setBatter(previous.batter);
    setOppBatter(previous.oppBatter);
    setSelectedResult(previous.selectedResult);
    setPins(previous.pins);
    setTeamAtBat(previous.teamAtBat);
    setBases(previous.bases);
    setUndoStack(rest);
    setEventLog((prev) => prev.slice(1));
    setLastPlay("Undid last logged field event.");
  };

  const loadTestModeGame = () => {
    const now = Date.now();
    const demoPins: EventPin[] = [
      { id: now + 1, batter: "#3", result: "single", zone: "left_field", x: 24, y: 40, inning: 1, battingTeam: "outlaws" },
      { id: now + 2, batter: "#6", result: "out", zone: "shortstop", x: 44, y: 56, inning: 1, battingTeam: "outlaws" },
      { id: now + 3, batter: "#11", result: "double", zone: "right_center", x: 67, y: 33, inning: 2, battingTeam: "opponent" },
      { id: now + 4, batter: "#15", result: "strikeout", zone: "catcher_zone", x: 50, y: 82, inning: 2, battingTeam: "opponent" },
      { id: now + 5, batter: "#18", result: "walk", zone: "pitcher_zone", x: 50, y: 65, inning: 3, battingTeam: "outlaws" },
      { id: now + 6, batter: "#20", result: "home_run", zone: "center_field", x: 50, y: 28, inning: 3, battingTeam: "outlaws" },
    ];
    setPins(demoPins);
    setOurRuns(3);
    setOppRuns(1);
    setInning(4);
    setOuts(1);
    setTeamAtBat("outlaws");
    setBatter(outlawsLineup[0] ?? "#00");
    setOppBatter(opponentsLineup[0] ?? "");
    setSelectedResult("single");
    setBases({ first: null, second: null, third: null });
    setBalls(0);
    setStrikes(0);
    setUndoStack([]);
    setEventLog([]);
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
    setLastPlay("Loaded test-mode demo game.");
  };

  const clearBase = (which: keyof Bases) => setBases((prev) => ({ ...prev, [which]: null }));
  const clearAllBases = () => setBases(EMPTY_BASES);

  const advanceHalfInning = () => {
    setOuts(0);
    setBases(EMPTY_BASES);
    setBalls(0);
    setStrikes(0);
    setScoringStep("idle");
    setPendingContact(null);
    setRunOverride(null);
    if (teamAtBat === awayTeam) {
      setTeamAtBat(homeTeam);
      setLastPlay(`Advanced to bottom ${inning}: ${teamLabel(homeTeam)} batting.`);
    } else {
      setTeamAtBat(awayTeam);
      setInning((value) => value + 1);
      setLastPlay(`Advanced to top ${inning + 1}: ${teamLabel(awayTeam)} batting.`);
    }
  };

  const setActiveBatter = (name: string) => {
    if (teamAtBat === "outlaws") setBatter(name);
    else setOppBatter(name);
  };

  // Live lineup building: add a batter mid-game and make them the current hitter.
  // No backend change needed — lineups persist via the localStorage effect.
  const addBatterToActiveLineup = (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    const setLineup = teamAtBat === "outlaws" ? setOutlawsLineup : setOpponentsLineup;
    setLineup((prev) => (prev.includes(name) ? prev : [...prev, name].slice(0, MAX_LINEUP_PLAYERS)));
    setActiveBatter(name);
    setLastPlay(`Added ${name} to ${teamLabel(teamAtBat)} lineup and set as batter.`);
  };

  const updateDefenseSpot = (group: DefenseGroupName, spot: string, value: string) => {
    setDefenseGroups((prev) => ({
      ...prev,
      [group]: {
        ...(prev[group] || makeBlankDefense()),
        [spot]: value,
      },
    }));
  };

  // The "＋ new player" escape hatch required by MERGE-PLAN.md §2.5. A coach
  // must still be able to field a kid who isn't in the lineup yet — mid-game,
  // one-handed, with the game running. Prompting once and adding to the lineup
  // means the name enters the roster union, so the next spot offers it as an
  // option instead of demanding it be retyped. Retyping is what B4 is.
  const addDefensePlayer = (group: DefenseGroupName, spot: string) => {
    const typed = typeof window === "undefined" ? null : window.prompt("New player name");
    const name = (typed || "").trim();
    if (!name) return;
    setOutlawsLineup((prev) =>
      prev.includes(name) ? prev : [...prev, name].slice(0, MAX_LINEUP_PLAYERS),
    );
    updateDefenseSpot(group, spot, name);
  };

  return (
    <div className="min-h-screen app-shell text-slate-100 touch-manipulation">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-3 py-4 sm:px-6 lg:flex-row lg:items-start">
        <section className="w-full rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-2xl lg:w-2/3">
          <header className="mb-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Outlaws · Inning {inning} · {currentDefenseGroup}</p>
              <h1 className="text-2xl font-black tracking-tight">Game Logger</h1>
              {lastPlay && <p className="mt-1 truncate text-sm text-cyan-100/85">{lastPlay}</p>}
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/35 min-h-[44px] touch-manipulation"
                onClick={() => setShowSetup((v) => !v)}
              >
                {showSetup ? "Close" : "Setup"}
              </button>
              <Link href="/coach/lineup" className="rounded-lg border border-emerald-300/40 bg-emerald-500/20 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-emerald-100 hover:bg-emerald-500/35 min-h-[44px] flex items-center touch-manipulation">
                Lineup
              </Link>
              <Link href="/coach/dashboard" className="rounded-lg border border-cyan-300/40 bg-cyan-500/20 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/35 min-h-[44px] flex items-center touch-manipulation">
                Stats
              </Link>
            </div>
          </header>

          {/* Status Bar - Dugout readable */}
          <div className="mb-3 grid grid-cols-[1fr_auto] items-start gap-3">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Outs" value={String(outs)} big />
              <StatCard label="Count" value={`${balls}-${strikes}`} />
              <StatCard label="Outlaws" value={String(ourRuns)} accent="emerald" />
              <StatCard label={opponentLabel.length > 12 ? opponentLabel.split(" ").pop() ?? "Opp" : opponentLabel} value={String(oppRuns)} accent="rose" />
            </div>
            <BasesDiamond bases={bases} onClearBase={clearBase} onClearAll={clearAllBases} />
          </div>

          <div className="mb-3 flex items-center justify-between rounded-lg border border-cyan-300/25 bg-slate-950/60 px-3 py-2 text-xs text-cyan-100">
            <div>
              <span className="font-semibold">Defense:</span> {currentDefenseGroup} · {gameFormat === "coach_pitch" ? "Coach Pitch" : "Kid Pitch"} · <span className="text-slate-300">{summary.total} plays</span>
            </div>
            <button
              type="button"
              disabled={undoStack.length === 0}
              onClick={undoLastAction}
              className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-[10px] font-semibold active:bg-slate-700 disabled:opacity-40"
            >
              UNDO
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              className={`rounded-xl border px-5 py-3.5 text-sm font-bold tracking-wide touch-manipulation min-h-[48px] active:scale-[0.985] transition-all ${teamAtBat === "outlaws" ? "border-emerald-400 bg-emerald-500/25" : "border-slate-600 bg-slate-800"}`}
              onClick={() => setTeamAtBat("outlaws")}
            >
              Outlaws Batting
            </button>
            <button
              type="button"
              className={`rounded-xl border px-5 py-3.5 text-sm font-bold tracking-wide touch-manipulation min-h-[48px] active:scale-[0.985] transition-all ${teamAtBat === "opponent" ? "border-rose-400 bg-rose-500/25" : "border-slate-600 bg-slate-800"}`}
              onClick={() => setTeamAtBat("opponent")}
            >
              {opponentLabel} Batting
            </button>
            <BatterPicker
              lineup={activeLineup}
              activeBatter={activeBatter}
              onSelect={setActiveBatter}
              onAdd={addBatterToActiveLineup}
              teamLabel={teamLabel(teamAtBat)}
            />
          </div>

          {scoringStep === "advance" && (
            <div className="mb-3 rounded-xl border border-sky-300/35 bg-sky-950/45 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">
                  {pendingContact ? `${pendingContact} · ` : ""}Pick result, then tap the field
                </p>
                <button type="button" className="rounded-md border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-200" onClick={cancelScoringFlow}>
                  Cancel
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {QUICK_RESULTS.map((result) => {
                  const active = selectedResult === result;
                  return (
                    <button
                      key={result}
                      type="button"
                      className={`rounded-lg border px-3 py-2.5 text-sm font-black touch-manipulation min-h-[44px] active:scale-[0.985] transition-all ${active ? resultStyles[result] : "border-slate-600 bg-slate-900 text-slate-100"}`}
                      onClick={() => setSelectedResult(result)}
                    >
                      {resultLabel[result]}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-sky-100/80">Runs</span>
                {RUN_OVERRIDE_OPTIONS.map((value) => {
                  const active = runOverride === value;
                  const label = value === null ? "Auto" : `+${value}`;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-black touch-manipulation active:scale-[0.985] ${
                        active ? "border-amber-200 bg-amber-300 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-100"
                      }`}
                      onClick={() => setRunOverride(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-sky-100/80">Contact</span>
                <span className="text-[10px] text-sky-100/50">(optional)</span>
                {CONTACT_TYPES.map((contact) => {
                  const active = pendingContact === contact;
                  return (
                    <button
                      key={contact}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold touch-manipulation active:scale-[0.985] ${
                        active ? "border-sky-200 bg-sky-300 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-100"
                      }`}
                      onClick={() => handleContactSelect(contact)}
                    >
                      {contact}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className="baseball-field-canvas relative mx-auto aspect-square w-full max-w-[680px] touch-manipulation overflow-hidden rounded-2xl border-2 border-cyan-300/40 cursor-crosshair select-none sm:aspect-[3/2]"
            onPointerUp={onFieldTap}
            role="button"
            aria-label="Baseball field hit map"
          >
            <Image
              src="/images/field-bg-combined-final.jpg?v=20260528-4"
              alt="Baseball field background"
              fill
              className="absolute inset-0 object-cover object-[center_36%]"
              sizes="(max-width: 768px) 100vw, 560px"
            />
            <div className="absolute inset-0 bg-black/10" />
            <FieldDot x={FIELD_DOT_POSITIONS.H.x} y={FIELD_DOT_POSITIONS.H.y} label="H" />
            <FieldDot x={FIELD_DOT_POSITIONS.P.x} y={FIELD_DOT_POSITIONS.P.y} label="P" player={currentDefense.P} />
            <FieldDot x={FIELD_DOT_POSITIONS["3B"].x} y={FIELD_DOT_POSITIONS["3B"].y} label="3B" player={currentDefense["3B"]} />
            <FieldDot x={FIELD_DOT_POSITIONS["1B"].x} y={FIELD_DOT_POSITIONS["1B"].y} label="1B" player={currentDefense["1B"]} />
            <FieldDot x={FIELD_DOT_POSITIONS.SS.x} y={FIELD_DOT_POSITIONS.SS.y} label="SS" player={currentDefense.SS} />
            <FieldDot x={FIELD_DOT_POSITIONS["2B"].x} y={FIELD_DOT_POSITIONS["2B"].y} label="2B" player={currentDefense["2B"]} />
            <FieldDot x={FIELD_DOT_POSITIONS.LF.x} y={FIELD_DOT_POSITIONS.LF.y} label="LF" player={currentDefense.LF} />
            {gameFormat === "coach_pitch" ? (
              <>
                <FieldDot x={FIELD_DOT_POSITIONS.LCF.x} y={FIELD_DOT_POSITIONS.LCF.y} label="LCF" player={currentDefense.LCF} />
                <FieldDot x={FIELD_DOT_POSITIONS.RCF.x} y={FIELD_DOT_POSITIONS.RCF.y} label="RCF" player={currentDefense.RCF} />
              </>
            ) : (
              <FieldDot x={FIELD_DOT_POSITIONS.CF.x} y={FIELD_DOT_POSITIONS.CF.y} label="CF" player={currentDefense.CF} />
            )}
            <FieldDot x={FIELD_DOT_POSITIONS.RF.x} y={FIELD_DOT_POSITIONS.RF.y} label="RF" player={currentDefense.RF} />
            <div className="field-vignette absolute inset-0" />

            <RunnerTile x={50} y={78} label="BR" player={activeBatter} active={scoringStep === "advance"} />
            {bases.first && <RunnerTile x={63} y={68} label="1B" player={bases.first} active={scoringStep === "advance"} />}
            {bases.second && <RunnerTile x={50} y={50} label="2B" player={bases.second} active={scoringStep === "advance"} />}
            {bases.third && <RunnerTile x={37} y={68} label="3B" player={bases.third} active={scoringStep === "advance"} />}

            {pins.map((pin) => (
              <div
                key={pin.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/70 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow"
                style={{
                  left: `${pin.x}%`,
                  top: `${pin.y}%`,
                  backgroundColor: pin.result === "out" || pin.result === "strikeout" ? "#dc2626" : pin.battingTeam === "outlaws" ? "#0f766e" : "#c026d3",
                }}
                title={`${pin.batter} ${resultLabel[pin.result]} (${pin.zone}) inning ${pin.inning}`}
              >
                {resultLabel[pin.result]}
              </div>
            ))}

            {scoringStep === "advance" ? (
              <p className="absolute bottom-2 left-2 right-2 rounded bg-sky-950/85 px-2 py-1 text-center text-[11px] font-bold text-sky-50">
                {pendingContact} · {resultLabel[selectedResult]} · {runOverride === null ? "auto runs" : `+${runOverride} runs`}
              </p>
            ) : (
              <p className="absolute bottom-2 left-2 rounded bg-black/45 px-2 py-1 text-[11px] font-medium text-white">Ready</p>
            )}
          </div>

          <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-slate-700 bg-slate-950/96 px-4 py-3 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <button type="button" disabled={scoringStep !== "idle"} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm font-black min-h-[48px] active:scale-[0.985] disabled:opacity-40" onClick={() => handlePitch("ball")}>Ball</button>
              <button type="button" disabled={scoringStep !== "idle"} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm font-black min-h-[48px] active:scale-[0.985] disabled:opacity-40" onClick={() => handlePitch("called_strike")}>Called Strike</button>
              <button type="button" disabled={scoringStep !== "idle"} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm font-black min-h-[48px] active:scale-[0.985] disabled:opacity-40" onClick={() => handlePitch("swinging_strike")}>Swing & Miss</button>
              <button type="button" disabled={scoringStep !== "idle"} className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm font-black min-h-[48px] active:scale-[0.985] disabled:opacity-40" onClick={() => handlePitch("foul")}>Foul Ball</button>
              <button type="button" disabled={scoringStep !== "idle"} className="col-span-2 rounded-lg border border-emerald-300/70 bg-emerald-500 px-3 py-3 text-sm font-black text-slate-950 min-h-[48px] active:scale-[0.985] disabled:opacity-40 sm:col-span-1" onClick={() => handlePitch("in_play")}>Ball In Play</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" className="rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white active:scale-95 touch-manipulation" onClick={() => setOurRuns((v) => v + 1)}>+ Outlaws Run</button>
            <button type="button" className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-semibold text-white active:scale-95 touch-manipulation" onClick={() => setOppRuns((v) => v + 1)}>+ {opponentLabel.split(" ")[0]} Run</button>
            <button type="button" className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-900 active:scale-95 touch-manipulation" onClick={advanceHalfInning}>Next Half-Inning</button>
            <button type="button" className="rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white active:scale-95 touch-manipulation" onClick={resetGame}>End & Save Game</button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 touch-manipulation disabled:opacity-40"
              disabled={undoStack.length === 0}
              onClick={undoLastAction}
            >
              Undo Last Field Tap
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-semibold text-white active:scale-95 touch-manipulation"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm("Clear current game events and score? This does NOT save to history.")) {
                  clearCurrentGameNoSave();
                }
              }}
            >
              Clear Current Game
            </button>
            <button
              type="button"
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-slate-200 active:scale-95 touch-manipulation"
              onClick={() => {
                if (typeof window !== "undefined" && window.confirm("Clear all saved game history from this browser?")) {
                  window.localStorage.removeItem(HISTORY_KEY);
                  setLastPlay("Cleared saved game history from this browser.");
                }
              }}
            >
              Clear Saved History
            </button>
          </div>
          {lastSavedGameId && (
            <div className="mt-2 rounded-lg border border-cyan-300/25 bg-slate-950/60 p-2 text-xs text-cyan-100">
              <div className="font-semibold">Read-only share link ready:</div>
              <a className="underline break-all" href={`/coach/game/${lastSavedGameId}`} target="_blank" rel="noreferrer">
                /game/{lastSavedGameId}
              </a>
            </div>
          )}
          {shareSyncStatus && !lastSavedGameId && (
            <div className="mt-2 rounded-lg border border-amber-300/25 bg-slate-950/60 p-2 text-xs text-amber-100">
              {shareSyncStatus}
            </div>
          )}
          {(linescore.length > 0 || boxScore.length > 0) && (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Line Score</h3>
                <div className="overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-2 py-1 text-left">Team</th>
                        {linescore.map(([inn]) => <th key={`inn-h-${inn}`} className="px-2 py-1">{inn}</th>)}
                        <th className="px-2 py-1">R</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-2 py-1 font-semibold">Outlaws</td>
                        {linescore.map(([inn, v]) => <td key={`o-${inn}`} className="px-2 py-1 text-center">{v.outlaws}</td>)}
                        <td className="px-2 py-1 text-center font-bold">{ourRuns}</td>
                      </tr>
                      <tr>
                        <td className="px-2 py-1 font-semibold">{opponentLabel}</td>
                        {linescore.map(([inn, v]) => <td key={`p-${inn}`} className="px-2 py-1 text-center">{v.opponent}</td>)}
                        <td className="px-2 py-1 text-center font-bold">{oppRuns}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Outlaws Box</h3>
                <div className="max-h-40 overflow-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="px-1 py-1 text-left">Batter</th>
                        <th className="px-1 py-1">PA</th>
                        <th className="px-1 py-1">AB</th>
                        <th className="px-1 py-1">H</th>
                        <th className="px-1 py-1">BB</th>
                        <th className="px-1 py-1">K</th>
                      </tr>
                    </thead>
                    <tbody>
                      {boxScore.map(([name, stat]) => (
                        <tr key={`bx-${name}`}>
                          <td className="px-1 py-1">{name}</td>
                          <td className="px-1 py-1 text-center">{stat.PA}</td>
                          <td className="px-1 py-1 text-center">{stat.AB}</td>
                          <td className="px-1 py-1 text-center">{stat.H}</td>
                          <td className="px-1 py-1 text-center">{stat.BB}</td>
                          <td className="px-1 py-1 text-center">{stat.K}</td>
                        </tr>
                      ))}
                      {boxScore.length === 0 && (
                        <tr><td colSpan={6} className="px-1 py-2 text-slate-400">No plate appearances yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="w-full rounded-2xl border border-cyan-300/20 bg-slate-900/78 p-4 shadow-xl lg:w-1/3">
          <h2 className="mb-3 text-lg font-extrabold tracking-tight text-cyan-100">Current Defense Group</h2>
          <div className="grid grid-cols-1 gap-2 text-xs">
            {activeDefenseSpots.map((spot) => (
              <div key={spot.code} className="grid grid-cols-[72px_1fr] items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-2">
                <span className="font-bold text-cyan-200">{spot.code} · {spot.label}</span>
                <span className="text-slate-100">{currentDefense[spot.code] || "-"}</span>
              </div>
            ))}
          </div>

          <h3 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-slate-200">Live Feed</h3>
          <ul className="max-h-52 space-y-2 overflow-auto pr-1 text-xs">
            {(eventLog.length > 0 ? eventLog.slice(0, 10) : pins.slice(0, 8).map((pin) => ({
              id: `fallback-${pin.id}`,
              inning: pin.inning,
              batter: pin.batter,
              result: pin.result,
              battingTeam: pin.battingTeam,
              description: `${pin.batter} · ${resultLabel[pin.result]} · ${pin.zone.replaceAll("_", " ")}`,
              stateAfter: { outs, outlawsRuns: ourRuns, opponentRuns: oppRuns, bases },
            }))).map((event) => (
              <li key={`recent-${event.id}`} className="rounded-lg border border-slate-700 bg-slate-950/50 p-2">
                <div className="font-semibold">{event.batter} · {resultLabel[event.result]} · Inning {event.inning}</div>
                <div className="text-slate-300">{event.battingTeam === "outlaws" ? "Outlaws" : opponentLabel} · {event.description}</div>
                <div className="text-slate-400">Outs {event.stateAfter.outs} · Score {event.stateAfter.outlawsRuns}-{event.stateAfter.opponentRuns}</div>
              </li>
            ))}
            {pins.length === 0 && <li className="text-slate-400">No plays logged yet.</li>}
          </ul>
        </section>
      </main>

      {showSetup && (
        <section ref={setupRef} className="mx-auto mb-6 w-full max-w-7xl rounded-2xl border border-emerald-300/25 bg-slate-900/85 p-4 shadow-2xl">
          <h2 className="mb-3 text-lg font-black tracking-tight text-emerald-100">Game Setup (Lineups + Defense Groups)</h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">Game Format</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${gameFormat === "coach_pitch" ? "border-cyan-300 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => setGameFormat("coach_pitch")}
                  >
                    Coach Pitch
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${gameFormat === "kid_pitch" ? "border-cyan-300 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => setGameFormat("kid_pitch")}
                  >
                    Kid Pitch
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-cyan-300/20 bg-slate-950/55 p-3">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-300">Mode</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${!isTestMode ? "border-cyan-300 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => setIsTestMode(false)}
                  >
                    Live Game
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isTestMode ? "border-cyan-300 bg-cyan-500/25 text-cyan-100" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => setIsTestMode(true)}
                  >
                    Test Mode
                  </button>
                </div>
                {isTestMode && (
                  <div className="mt-2 space-y-2">
                    <p className="text-[11px] text-cyan-100/80">Test mode lets you practice flow without relying on real game data.</p>
                    <button
                      type="button"
                      className="w-full rounded-lg border border-cyan-400/40 bg-cyan-600/25 px-3 py-2 text-xs font-semibold text-cyan-50"
                      onClick={loadTestModeGame}
                    >
                      Load Demo Test Game
                    </button>
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Opponent Team Name</span>
                <input
                  className="rounded-xl border border-rose-500/40 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  placeholder="Opponents (e.g. Oregon Park Wahoos)"
                  value={opponentTeamName}
                  onChange={(e) => setOpponentTeamName(e.target.value)}
                />
              </label>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Outlaws Are</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={pins.length > 0}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold min-h-[44px] touch-manipulation disabled:opacity-50 ${!outlawsAreHome ? "border-cyan-300 bg-cyan-500/25 text-cyan-50" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => toggleOutlawsHome(false)}
                  >
                    Away (bat first)
                  </button>
                  <button
                    type="button"
                    disabled={pins.length > 0}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-bold min-h-[44px] touch-manipulation disabled:opacity-50 ${outlawsAreHome ? "border-emerald-300 bg-emerald-500/25 text-emerald-50" : "border-slate-600 bg-slate-900 text-slate-300"}`}
                    onClick={() => toggleOutlawsHome(true)}
                  >
                    Home (bat last)
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">
                  {outlawsAreHome
                    ? `${opponentLabel} bats top, Outlaws bat bottom.`
                    : `Outlaws bat top, ${opponentLabel} bats bottom.`}
                  {pins.length > 0 ? " (Locked: plays already logged.)" : ""}
                </span>
              </div>
              <SavedGamesCheck />
              <LineupEditor
                label="Outlaws Lineup"
                lineup={outlawsLineup}
                onChange={setOutlawsLineup}
                accent="cyan"
                addLabel="Add Batter"
              />
              <LineupEditor
                label={`${opponentLabel} Lineup`}
                lineup={opponentsLineup}
                onChange={setOpponentsLineup}
                accent="rose"
                addLabel="Add Batter"
              />
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Inning To Defense Group</h3>
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }, (_, idx) => idx + 1).map((n) => (
                    <label key={n} className="flex flex-col gap-1 rounded border border-slate-700 bg-slate-950/60 p-2 text-xs">
                      <span className="font-semibold text-slate-300">Inning {n}</span>
                      <select
                        className="rounded border border-slate-600 bg-slate-900 px-2 py-1"
                        value={inningDefenseGroup[n] || "A1"}
                        onChange={(e) => setInningDefenseGroup((prev) => ({ ...prev, [n]: e.target.value as DefenseGroupName }))}
                      >
                        {DEFENSE_GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-200">Edit Defense Group</h3>
                <div className="mb-2 grid grid-cols-3 gap-2">
                  {DEFENSE_GROUPS.map((group) => (
                    <button
                      key={group}
                      type="button"
                      className={`rounded border px-2 py-1 text-xs font-semibold ${setupGroup === group ? "border-emerald-400 bg-emerald-500/30" : "border-slate-600 bg-slate-900"}`}
                      onClick={() => setSetupGroup(group)}
                    >
                      {group}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  {/*
                    Roster <select>, not a free-text input — fixes B4
                    (MERGE-PLAN.md §0.3, §2.5). Options come from
                    defenseRosterOptions; "＋ new player" is the escape hatch.

                    The assigned value is canonicalized before comparison so an
                    existing "Linc" assignment still matches the "Lincoln"
                    option rather than falling off the list. Anything that
                    somehow still doesn't match is rendered as its own option
                    instead of being silently dropped — never lose a coach's
                    assignment to a validation rule.
                  */}
                  {activeDefenseSpots.map((spot) => {
                    const assigned = canonicalPlayerName(defenseGroups[setupGroup]?.[spot.code] ?? "");
                    const current = assigned === "Unknown" ? "" : assigned;
                    const unlisted = current !== "" && !defenseRosterOptions.includes(current);
                    return (
                      <label key={`${setupGroup}-${spot.code}`} className="grid grid-cols-[72px_1fr] items-center gap-2 rounded border border-slate-700 bg-slate-950/60 px-2 py-2">
                        <span className="font-bold text-emerald-200">{spot.code} · {spot.label}</span>
                        <select
                          className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
                          aria-label={`${spot.label} — ${setupGroup}`}
                          value={current}
                          onChange={(e) => {
                            if (e.target.value === NEW_PLAYER_OPTION) {
                              addDefensePlayer(setupGroup, spot.code);
                              return;
                            }
                            updateDefenseSpot(setupGroup, spot.code, e.target.value);
                          }}
                        >
                          <option value="">— empty —</option>
                          {unlisted && <option value={current}>{current}</option>}
                          {defenseRosterOptions.map((player) => (
                            <option key={player} value={player}>{player}</option>
                          ))}
                          <option value={NEW_PLAYER_OPTION}>＋ new player…</option>
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function SavedGamesCheck() {
  const [games] = useState<SavedGameHistory[]>(() => readSavedHistory());
  const [serverGames, setServerGames] = useState<Array<{ id: string; label?: string; pinCount?: number }>>([]);

  useEffect(() => {
    fetch("/api/coach/games")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.games)) {
          setServerGames(data.games);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Saved Games In This Browser</p>
      <ul className="mt-1 max-h-24 overflow-auto text-[11px] text-slate-200">
        {games.slice(0, 6).map((g) => (
          <li key={g.id}>{g.label}</li>
        ))}
        {games.length === 0 && <li className="text-slate-400">No saved games found yet.</li>}
      </ul>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-300">Loaded Games From App DB</p>
      <ul className="mt-1 max-h-24 overflow-auto text-[11px] text-slate-200">
        {serverGames.slice(0, 6).map((g) => (
          <li key={g.id}>
            <Link className="text-cyan-200 underline-offset-2 hover:underline" href={`/coach/game/${g.id}`}>
              {g.label || g.id}
            </Link>
            <span className="text-slate-400"> ({g.pinCount ?? 0} events)</span>
          </li>
        ))}
        {serverGames.length === 0 && <li className="text-slate-400">No app DB games loaded.</li>}
      </ul>
    </div>
  );
}

function BatterPicker({
  lineup,
  activeBatter,
  onSelect,
  onAdd,
  teamLabel,
}: {
  lineup: string[];
  activeBatter: string;
  onSelect: (name: string) => void;
  onAdd: (name: string) => void;
  teamLabel: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const confirmAdd = () => {
    const name = draft.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    onAdd(name);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Batter</span>
      {adding ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            className="min-h-[44px] flex-1 rounded-xl border border-amber-400/50 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100"
            placeholder="Number or name"
            value={draft}
            inputMode="text"
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirmAdd(); }
              if (e.key === "Escape") { setDraft(""); setAdding(false); }
            }}
          />
          <button
            type="button"
            className="min-h-[44px] shrink-0 rounded-xl border border-emerald-400/60 bg-emerald-500/25 px-3 text-sm font-bold text-emerald-50 touch-manipulation active:scale-95"
            onClick={confirmAdd}
          >
            Add
          </button>
          <button
            type="button"
            aria-label="Cancel add batter"
            className="min-h-[44px] w-11 shrink-0 rounded-xl border border-slate-600 bg-slate-900 text-lg text-slate-300 touch-manipulation active:scale-95"
            onClick={() => { setDraft(""); setAdding(false); }}
          >
            ×
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <select
            className="min-h-[44px] flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-medium"
            value={lineup.includes(activeBatter) ? activeBatter : ""}
            onChange={(e) => onSelect(e.target.value)}
          >
            {lineup.length === 0 && <option value="">No batters yet — add one →</option>}
            {!lineup.includes(activeBatter) && lineup.length > 0 && <option value="">Select batter…</option>}
            {lineup.map((player) => (
              <option key={player} value={player}>{player}</option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Add batter to ${teamLabel} lineup`}
            className="min-h-[44px] shrink-0 rounded-xl border border-amber-400/50 bg-amber-500/20 px-3 text-sm font-bold text-amber-100 touch-manipulation active:scale-95"
            onClick={() => setAdding(true)}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}

function LineupEditor({
  label,
  lineup,
  onChange,
  accent,
  addLabel = "Add Batter",
}: {
  label: string;
  lineup: string[];
  onChange: (next: string[]) => void;
  accent: "cyan" | "rose";
  addLabel?: string;
}) {
  // Local rows allow blank entries while typing; the parent only ever receives the
  // cleaned, non-empty list. This is what fixes the old textarea bug where filter(Boolean)
  // ran on every keystroke and made it impossible to start a new row.
  const [rows, setRows] = useState<string[]>(() => (lineup.length ? [...lineup] : [""]));

  const commit = (next: string[]) => {
    setRows(next);
    onChange(next.map((v) => v.trim()).filter(Boolean).slice(0, MAX_LINEUP_PLAYERS));
  };
  const updateRow = (idx: number, value: string) => {
    const next = rows.slice();
    next[idx] = value;
    commit(next);
  };
  const addRow = () => {
    if (rows.length >= MAX_LINEUP_PLAYERS) return;
    commit([...rows, ""]);
  };
  const removeRow = (idx: number) => {
    const next = rows.filter((_, i) => i !== idx);
    commit(next.length ? next : [""]);
  };
  const clearAll = () => {
    if (typeof window !== "undefined" && !window.confirm(`Clear all batters from ${label}?`)) return;
    commit([""]);
  };

  const accentRing = accent === "cyan" ? "border-cyan-300/30" : "border-rose-400/30";
  const accentChip = accent === "cyan" ? "bg-cyan-500/20 text-cyan-100" : "bg-rose-500/20 text-rose-100";
  const filled = rows.filter((v) => v.trim()).length;
  const atMax = rows.length >= MAX_LINEUP_PLAYERS;

  return (
    <div className={`flex flex-col gap-2 rounded-xl border ${accentRing} bg-slate-950/55 p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">{filled} batter{filled === 1 ? "" : "s"}</span>
          {filled > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-rose-400/40 bg-rose-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-rose-100 touch-manipulation hover:bg-rose-500/30"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((value, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${accentChip}`}>{idx + 1}</span>
            <input
              className="min-h-[44px] flex-1 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              placeholder="Number or name"
              value={value}
              inputMode="text"
              autoComplete="off"
              onChange={(e) => updateRow(idx, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRow();
                }
              }}
            />
            <button
              type="button"
              aria-label={`Remove batter ${idx + 1}`}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-600 bg-slate-900 text-lg text-slate-300 touch-manipulation hover:bg-rose-600/30 hover:text-rose-100"
              onClick={() => removeRow(idx)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addRow}
        disabled={atMax}
        className="mt-1 min-h-[44px] rounded-lg border border-dashed border-slate-500 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-slate-200 touch-manipulation hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + {addLabel}
      </button>
      {atMax && <p className="text-[11px] text-amber-300/80">Max {MAX_LINEUP_PLAYERS} batters.</p>}
    </div>
  );
}

function getDefenseGroupForInning(map: Record<number, DefenseGroupName>, inning: number): DefenseGroupName {
  if (map[inning]) return map[inning];
  const cycle = DEFENSE_GROUPS[(Math.max(inning, 1) - 1) % DEFENSE_GROUPS.length];
  return cycle;
}

function StatCard({ label, value, big = false, accent }: { label: string; value: string; big?: boolean; accent?: "emerald" | "rose" }) {
  const valueColor =
    accent === "emerald" ? "text-emerald-400" :
    accent === "rose" ? "text-rose-400" :
    "text-cyan-100";

  return (
    <div className="rounded-xl border border-slate-600 bg-slate-900/75 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`font-black leading-none tabular-nums ${big ? "text-4xl mt-0.5" : "text-2xl"} ${valueColor}`}>{value}</p>
    </div>
  );
}

function BasesDiamond({ bases, onClearBase, onClearAll }: { bases: Bases; onClearBase: (which: keyof Bases) => void; onClearAll: () => void }) {
  const baseClass = (occupied: boolean) =>
    `absolute h-7 w-7 rotate-45 border-2 transition touch-manipulation ${occupied ? "border-amber-200 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" : "border-slate-500 bg-slate-800"}`;
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-cyan-300/25 bg-slate-950/60 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Bases</p>
      <div className="relative h-20 w-20">
        <button
          type="button"
          aria-label="Second base"
          title={bases.second ? `2B: ${bases.second} (tap to clear)` : "2B empty"}
          className={`${baseClass(!!bases.second)} left-1/2 top-0 -translate-x-1/2 active:scale-95 touch-manipulation`}
          onClick={() => bases.second && onClearBase("second")}
        />
        <button
          type="button"
          aria-label="Third base"
          title={bases.third ? `3B: ${bases.third} (tap to clear)` : "3B empty"}
          className={`${baseClass(!!bases.third)} left-0 top-1/2 -translate-y-1/2 active:scale-95 touch-manipulation`}
          onClick={() => bases.third && onClearBase("third")}
        />
        <button
          type="button"
          aria-label="First base"
          title={bases.first ? `1B: ${bases.first} (tap to clear)` : "1B empty"}
          className={`${baseClass(!!bases.first)} right-0 top-1/2 -translate-y-1/2 active:scale-95 touch-manipulation`}
          onClick={() => bases.first && onClearBase("first")}
        />
        <div className="absolute bottom-0 left-1/2 h-5 w-5 -translate-x-1/2 border-2 border-slate-400 bg-slate-700" />
      </div>
      <div className="flex h-4 items-center gap-2 text-[10px] font-bold text-amber-200">
        <span className={bases.third ? "" : "text-slate-600"}>3B{bases.third ? `:${bases.third}` : ""}</span>
        <span className={bases.second ? "" : "text-slate-600"}>2B{bases.second ? `:${bases.second}` : ""}</span>
        <span className={bases.first ? "" : "text-slate-600"}>1B{bases.first ? `:${bases.first}` : ""}</span>
      </div>
      <button
        type="button"
        className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-300 active:scale-95 touch-manipulation"
        onClick={onClearAll}
      >
        Clear All Bases
      </button>
    </div>
  );
}

function RunnerTile({ x, y, label, player, active }: { x: number; y: number; label: string; player: string; active: boolean }) {
  return (
    <div
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md border px-2 py-1 text-[10px] font-black shadow-lg transition ${
        active ? "border-sky-100 bg-sky-500 text-white shadow-sky-950/50" : "border-white/40 bg-slate-950/70 text-slate-200"
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      <span className="mr-1 opacity-80">{label}</span>{player}
    </div>
  );
}

function FieldDot({ x, y, label, player }: { x: number; y: number; label: string; player?: string }) {
  return (
    <div
      className="absolute max-w-20 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-white/80 bg-black/50 px-1.5 py-0.5 text-[10px] font-bold text-white"
      style={{ left: `${x}%`, top: `${y}%` }}
      title={player ? `${label}: ${player}` : label}
    >
      {player ? `${label} ${player}` : label}
    </div>
  );
}

function readSavedGameState(): Partial<SavedGameState> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readSavedHistory(): SavedGameHistory[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
