"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import { Diamond, PositionKey, TapState } from "@/components/Diamond";
import { recordAttempt } from "@/lib/gameStorage";

const POSITION_NAMES: Record<PositionKey, string> = {
  LF: "Left Field",
  CF: "Center Field",
  RF: "Right Field",
  SS: "Shortstop",
  "2B": "Second Base",
  "1B": "First Base",
  "3B": "Third Base",
  P: "Pitcher",
  C: "Catcher",
};

// Standard scorebook order (1-9): battery, infield, outfield — reads naturally
// top-to-bottom, unlike raw field (x,y) insertion order.
const POSITION_GRID: PositionKey[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PositionPage() {
  const [position, setPosition] = useState<PositionKey | null>(null);
  const [scenarios, setScenarios] = useState<typeof BACKUP_SCENARIOS>([]);
  const [current, setCurrent] = useState(0);
  const [tappedZone, setTappedZone] = useState<string | null>(null);
  const [tapState, setTapState] = useState<TapState>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  const positionCounts = useMemo(() => {
    const counts: Partial<Record<PositionKey, number>> = {};
    for (const s of BACKUP_SCENARIOS) counts[s.targetZone] = (counts[s.targetZone] ?? 0) + 1;
    return counts;
  }, []);

  const choosePosition = (zone: string) => {
    const pos = zone as PositionKey;
    const matches = shuffle(BACKUP_SCENARIOS.filter(s => s.targetZone === pos));
    setPosition(pos);
    setScenarios(matches);
    setCurrent(0);
    setCorrectCount(0);
    setDone(false);
    setTappedZone(null);
    setTapState(null);
  };

  const reset = () => {
    setPosition(null);
    setScenarios([]);
    setDone(false);
  };

  const handleTap = (zone: string) => {
    if (tapState !== null || !position) return;
    const s = scenarios[current];
    const correct = zone === s.targetZone;
    setTappedZone(zone);
    setTapState(correct ? "correct" : "wrong");
    recordAttempt(position, correct);
    if (correct) setCorrectCount(c => c + 1);
  };

  const handleNext = () => {
    if (current + 1 >= scenarios.length) {
      setDone(true);
    } else {
      setCurrent(c => c + 1);
      setTappedZone(null);
      setTapState(null);
    }
  };

  // ── Step 1: pick a position ──
  if (!position) {
    return (
      <div className="min-h-screen bg-[#0f2044] px-3 py-5">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/games" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
              ‹
            </Link>
            <Link href="/" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" aria-label="Warriors home">
              <Image src="/images/warriors/mascot.png" alt="" width={22} height={22} className="object-contain" />
              <span className="font-display text-white text-xs tracking-wide hidden sm:inline">WARRIORS</span>
            </Link>
          </div>

          <div className="text-center mb-5">
            <p className="text-[#c9a84c] font-bold text-[10px] uppercase tracking-[0.3em] mb-2">Free Play</p>
            <h1 className="font-display text-white text-4xl leading-none mb-2">WHERE DO I GO?</h1>
            <p className="text-white/45 text-sm font-medium">Tap your position on the field to practice ONLY your plays</p>
          </div>

          <Diamond
            runners={{ first: false, second: false, third: false }}
            ballZone=""
            interactive
            tapState={null}
            onTap={choosePosition}
          />

          <div className="grid grid-cols-3 gap-2 mt-5">
            {POSITION_GRID.map(pos => (
              <button
                key={pos}
                onClick={() => choosePosition(pos)}
                className="bg-white/10 hover:bg-white/20 active:scale-95 rounded-xl px-2 py-2.5 text-center transition-all"
              >
                <p className="text-white font-bold text-sm">{pos}</p>
                <p className="text-white/40 text-[10px]">{positionCounts[pos] ?? 0} play{(positionCounts[pos] ?? 0) === 1 ? "" : "s"}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2 / 3: no scenarios for this position (shouldn't happen, every position has plays) ──
  if (scenarios.length === 0) {
    return (
      <div className="min-h-screen bg-[#0f2044] px-4 py-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-2xl">
          <p className="text-gray-500 mb-4">No plays found for that position yet.</p>
          <button onClick={reset} className="bg-[#1a4a72] text-white font-bold text-sm uppercase tracking-wider py-3 px-6 rounded-2xl">
            Pick Another Position
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: done screen ──
  if (done) {
    const total = scenarios.length;
    return (
      <div className="min-h-screen bg-[#0f2044] px-4 py-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-2xl animate-pop-in">
          <div className="text-6xl mb-3">⚾</div>
          <h2 className="font-display text-[#0f2044] text-3xl mb-1">
            YOU KNOW {POSITION_NAMES[position].toUpperCase()}!
          </h2>
          <p className="text-gray-500 text-lg mb-6">
            <span className="font-bold text-[#0f2044]">{correctCount}</span> / {total} correct
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => choosePosition(position)}
              className="bg-[#1a4a72] hover:bg-[#1f5a8a] active:scale-95 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg"
            >
              Practice {position} Again
            </button>
            <button
              onClick={reset}
              className="bg-[#c9a84c] hover:bg-[#d4b55a] active:scale-95 text-[#0f2044] font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all"
            >
              Try Another Position
            </button>
            <Link
              href="/games"
              className="bg-gray-100 hover:bg-gray-200 active:scale-95 text-gray-700 font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all text-center"
            >
              Back to Games
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: playing ──
  const s = scenarios[current];
  return (
    <div className="min-h-screen bg-[#0f2044] px-3 py-5">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <button onClick={reset} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
            ‹
          </button>
          <Image src="/images/warriors/mascot.png" alt="" width={22} height={22} className="object-contain opacity-60" />
          <div className="flex-1" />
          <div className="rounded-full px-3.5 py-1.5 text-[#c9a84c] font-extrabold text-sm border-[1.5px]"
               style={{ background: "rgba(201,168,76,0.15)", borderColor: "rgba(201,168,76,0.35)" }}>
            Practicing {position}
          </div>
          <div className="text-white/40 text-[13px] font-bold shrink-0">{current + 1}/{scenarios.length}</div>
        </div>

        <div className="bg-white/10 rounded-2xl px-4 py-2.5 mb-3">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">Situation</p>
          <p className="text-white font-bold text-[14px] leading-snug">{s.label}</p>
        </div>

        <div className="relative mb-3">
          <Diamond
            runners={s.runners}
            ballZone={s.ballZone}
            targetZone={s.targetZone}
            tappedZone={tappedZone}
            tapState={tapState}
            onTap={handleTap}
            interactive={tapState === null}
          />
        </div>

        {tapState === null && (
          <p className="text-center text-white/50 text-[13px] font-semibold mb-3 tracking-wide">
            👆 Tap where {position} should be
          </p>
        )}

        <div className="game-panel rounded-3xl px-5 py-5 shadow-xl mb-4">
          <p className="font-display text-[#c9a84c] text-[12px] tracking-widest mb-1.5">📍 YOUR MOVE</p>
          <h2 className="text-white text-[17px] font-bold leading-snug">{s.question}</h2>

          {tapState !== null && (
            <div className={`mt-4 rounded-2xl px-4 py-4 text-[14px] leading-relaxed animate-pop-in ${tapState === "correct" ? "feedback-correct" : "feedback-wrong"}`}>
              <p className="font-bold mb-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black shrink-0 ${tapState === "correct" ? "feedback-badge-correct" : "feedback-badge-wrong"}`}>
                  {tapState === "correct" ? "✓" : "!"}
                </span>
                {tapState === "correct" ? "Correct!" : "Check the green circle!"}
              </p>
              <p>{s.explanation}</p>
            </div>
          )}
        </div>

        {tapState !== null && (
          <button
            onClick={handleNext}
            className="cta-gold w-full text-[#0f2044] font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px] animate-pop-in"
          >
            {current + 1 >= scenarios.length ? "See My Results →" : "Next Situation →"}
          </button>
        )}
      </div>
    </div>
  );
}
