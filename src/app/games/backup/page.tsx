"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { BACKUP_SCENARIOS, BackupScenario } from "@/lib/gameData";
import { Diamond, FIELD_POS, PositionKey, TapState } from "@/components/Diamond";
import { recordAttempt } from "@/lib/gameStorage";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function starRating(correct: number, total: number) {
  const pct = correct / total;
  if (pct >= 0.87) return "⭐⭐⭐";
  if (pct >= 0.60) return "⭐⭐";
  return "⭐";
}

// ── Streak-to-praise map ──
const PRAISE = ["Nice! 👍", "Keep Rolling! 💪", "Hot Streak! 🔥", "On Fire! 🔥🔥", "ALL-STAR! ⚡", "UNSTOPPABLE! ⭐"];
const getMultiplier = (streak: number) => streak >= 5 ? 3 : streak >= 3 ? 2 : streak >= 1 ? 1.5 : 1;

export default function BackupPage() {
  const [scenarios, setScenarios] = useState<BackupScenario[]>([]);
  const [current, setCurrent]     = useState(0);
  const [tappedZone, setTappedZone] = useState<string | null>(null);
  const [tapState, setTapState]     = useState<TapState>(null);
  const [score, setScore]     = useState(0);
  const [points, setPoints]   = useState(0);
  const [streak, setStreak]   = useState(0);
  const [gameState, setGameState] = useState<"playing" | "done">("playing");
  const [highScore, setHighScore] = useState(0);
  const [newHS, setNewHS] = useState(false);
  const [praiseKey, setPraiseKey]     = useState(0);
  const [praiseText, setPraiseText]   = useState("");
  const [praiseVisible, setPraiseVisible] = useState(false);
  const [pointsGain, setPointsGain]   = useState(0);
  const [shakeKey, setShakeKey] = useState(0);
  const [missed, setMissed] = useState<BackupScenario[]>([]);
  const [roundType, setRoundType] = useState<"full" | "rewind">("full");

  const scoreRef  = useRef(0);
  const pointsRef = useRef(0);
  const streakRef = useRef(0);
  const missedRef = useRef<BackupScenario[]>([]);
  const praiseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const init = useCallback(() => {
    setScenarios(shuffle(BACKUP_SCENARIOS));
    setCurrent(0);
    setTappedZone(null);
    setTapState(null);
    setScore(0);
    setPoints(0);
    setStreak(0);
    setGameState("playing");
    setNewHS(false);
    setPraiseVisible(false);
    setMissed([]);
    setRoundType("full");
    scoreRef.current  = 0;
    pointsRef.current = 0;
    streakRef.current = 0;
    missedRef.current = [];
  }, []);

  const startRewind = () => {
    setScenarios(shuffle(missedRef.current));
    setCurrent(0);
    setTappedZone(null);
    setTapState(null);
    setScore(0);
    setStreak(0);
    setGameState("playing");
    setNewHS(false);
    setRoundType("rewind");
    setMissed([]);
    scoreRef.current  = 0;
    streakRef.current = 0;
    missedRef.current = [];
    // points/pointsRef carry over — rewind adds half-value points to the same session
  };

  useEffect(() => {
    init();
    const hs = localStorage.getItem("warriors-backup-pts");
    if (hs) setHighScore(parseInt(hs, 10));
  }, [init]);

  const handleTap = (zone: string) => {
    if (tapState !== null) return;
    const s = scenarios[current];
    const correct = zone === s.targetZone;

    setTappedZone(zone);
    setTapState(correct ? "correct" : "wrong");
    recordAttempt(s.targetZone as PositionKey, correct);

    if (correct) {
      scoreRef.current += 1;
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      const base = roundType === "rewind" ? 50 : 100;
      const earned = Math.round(base * getMultiplier(newStreak));
      pointsRef.current += earned;
      setScore(scoreRef.current);
      setPoints(pointsRef.current);
      setStreak(newStreak);
      setPointsGain(earned);
      // Floating praise
      const msg = PRAISE[Math.min(newStreak - 1, PRAISE.length - 1)];
      setPraiseText(msg);
      setPraiseKey(k => k + 1);
      setPraiseVisible(true);
      if (praiseTimer.current) clearTimeout(praiseTimer.current);
      praiseTimer.current = setTimeout(() => setPraiseVisible(false), 1100);
    } else {
      streakRef.current = 0;
      setStreak(0);
      setShakeKey(k => k + 1);
      missedRef.current = [...missedRef.current, s];
      setMissed(missedRef.current);
    }
  };

  const handleNext = () => {
    const total = scenarios.length;
    if (current + 1 >= total) {
      const finalPts = pointsRef.current;
      const hs = parseInt(localStorage.getItem("warriors-backup-pts") || "0", 10);
      if (finalPts > hs) {
        localStorage.setItem("warriors-backup-pts", String(finalPts));
        setHighScore(finalPts);
        setNewHS(true);
      }
      setGameState("done");
    } else {
      setCurrent(c => c + 1);
      setTappedZone(null);
      setTapState(null);
    }
  };

  if (scenarios.length === 0) return null;

  const total = scenarios.length;
  const s     = scenarios[current];

  // ── Done screen ──
  if (gameState === "done") {
    const stars = starRating(score, total);
    const isRewind = roundType === "rewind";
    const canRewind = !isRewind && missed.length > 0;
    return (
      <div className="min-h-screen bg-[#0f2044] px-4 py-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-2xl animate-pop-in">
          <div className="text-6xl mb-3">{stars}</div>
          <h2 className="font-display text-[#0f2044] text-4xl mb-1">{isRewind ? "REWIND COMPLETE!" : "GREAT HUSTLE!"}</h2>
          {newHS && (
            <p className="text-[#8b1a2e] font-bold text-xs uppercase tracking-widest mb-2">🎉 New High Score!</p>
          )}
          <p className="text-gray-500 text-lg mb-1">
            <span className="font-bold text-[#0f2044]">{score}</span> / {total} correct
          </p>
          <p className="text-[#c9a84c] font-bold text-2xl mb-1">{points.toLocaleString()} pts</p>
          <p className="text-gray-400 text-sm mb-6">Best: {highScore.toLocaleString()} pts</p>

          <div className={`rounded-2xl p-4 mb-6 ${score === total ? "bg-green-50" : score >= Math.floor(total * 0.87) ? "bg-green-50" : score >= Math.floor(total * 0.60) ? "bg-amber-50" : "bg-red-50"}`}>
            {isRewind ? (
              <p className="text-green-700 font-bold">{score === total ? "🎯 Cleaned up every miss — nice work!" : "Getting sharper! Rewind again anytime."}</p>
            ) : (
              <>
                {score === total && <p className="text-green-700 font-bold">🏆 Perfect! You know exactly where to be on every play!</p>}
                {score >= Math.floor(total * 0.87) && score < total && <p className="text-green-700 font-bold">Your coaches are going to love you out there!</p>}
                {score >= Math.floor(total * 0.60) && score < Math.floor(total * 0.87) && <p className="text-amber-700 font-bold">Good effort! Play again and those positions will stick!</p>}
                {score < Math.floor(total * 0.60) && <p className="text-red-700 font-bold">Keep practicing — these positions take time to learn!</p>}
              </>
            )}
            <p className="text-gray-400 text-xs mt-2">💡 Ask your coach about specific plays!</p>
          </div>

          <div className="flex flex-col gap-3">
            {canRewind && (
              <button
                onClick={startRewind}
                className="bg-[#c9a84c] hover:bg-[#d4b55a] active:scale-95 text-[#0f2044] font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg"
              >
                🔁 Rewind Your {missed.length} Miss{missed.length === 1 ? "" : "es"} (Half Points)
              </button>
            )}
            <button
              onClick={init}
              className="bg-[#1a4a72] hover:bg-[#1f5a8a] active:scale-95 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg"
            >
              Play {isRewind ? "a Full Round" : "Again"}
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

  // ── Playing screen ──
  return (
    <div className="min-h-screen bg-[#0f2044] px-3 py-5">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" aria-label="Back to training games" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
            ‹
          </Link>
          <Link href="/" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" aria-label="InningWise home">
            <Image src="/inningwise.svg" alt="" width={22} height={22} className="object-contain" />
            <span className="font-display text-white text-xs tracking-wide hidden sm:inline">InningWise</span>
          </Link>
          <div className="flex-1" />
          {streak >= 2 ? (
            <div className="streak-flame flex items-center gap-1.5 font-extrabold text-white text-sm rounded-full px-3.5 py-1.5">
              🔥 {streak}
            </div>
          ) : null}
          <div className="relative flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[#c9a84c] font-extrabold text-sm border-[1.5px]"
               style={{ background: "rgba(201,168,76,0.15)", borderColor: "rgba(201,168,76,0.35)" }}>
            ⚡ {points.toLocaleString()}
            {praiseVisible && (
              <span
                key={`gain-${praiseKey}`}
                className="absolute -top-4 right-1 text-[#ffe28a] font-display text-sm animate-float-up pointer-events-none"
              >
                +{pointsGain}
              </span>
            )}
          </div>
          <div className="text-white/40 text-[13px] font-bold shrink-0">{current + 1}/{total}</div>
        </div>

        {/* Progress bar — a single continuous fill reads better than 36 tiny dots */}
        <div className="h-1.5 rounded-full overflow-hidden bg-white/10 mb-4">
          <div
            className="h-full bg-[#c9a84c] rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${((current + (tapState !== null ? 1 : 0)) / total) * 100}%` }}
          />
        </div>

        {/* Situation chip */}
        <div className="bg-white/10 rounded-2xl px-4 py-2.5 mb-3">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">Situation</p>
          <p className="text-white font-bold text-[14px] leading-snug">{s.label}</p>
        </div>

        {/* Diamond area — relative so praise text can float over it */}
        <div className="relative mb-3">
          <Diamond
            key={`${roundType}-${current}`}
            runners={s.runners}
            ballZone={s.ballZone}
            targetZone={s.targetZone}
            tappedZone={tappedZone}
            tapState={tapState}
            onTap={handleTap}
            interactive={tapState === null}
            showRelay={s.ballReachesTarget !== false}
          />

          {/* Floating praise text */}
          {praiseVisible && (
            <div
              key={praiseKey}
              className="absolute inset-x-0 top-8 flex justify-center pointer-events-none animate-float-up"
              style={{ zIndex: 10 }}
            >
              <span className="bg-[#c9a84c] text-[#0f2044] font-display text-xl px-6 py-2 rounded-full shadow-xl">
                {praiseText}
              </span>
            </div>
          )}
        </div>

        {/* Tap prompt — only while awaiting tap */}
        {tapState === null && (
          <p className="text-center text-white/50 text-[13px] font-semibold mb-3 tracking-wide">
            👆 Tap a player on the field
          </p>
        )}

        {/* Question card */}
        <div
          key={shakeKey}
          className={`game-panel rounded-3xl px-5 py-5 shadow-xl mb-4 ${shakeKey > 0 && tapState === "wrong" ? "animate-shake-h" : ""}`}
        >
          <p className="font-display text-[#c9a84c] text-[12px] tracking-widest mb-1.5">📍 YOUR MOVE</p>
          <h2 className="text-white text-[17px] font-bold leading-snug">
            {s.question}
          </h2>

          {/* Feedback after tap */}
          {tapState !== null && (
            <div
              className={`mt-4 rounded-2xl px-4 py-4 text-[14px] leading-relaxed animate-pop-in ${
                tapState === "correct" ? "feedback-correct" : "feedback-wrong"
              }`}
            >
              <p className="font-bold mb-1.5 flex items-center gap-2">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black shrink-0 ${tapState === "correct" ? "feedback-badge-correct" : "feedback-badge-wrong"}`}>
                  {tapState === "correct" ? "✓" : "!"}
                </span>
                {tapState === "correct" ? "Correct!" : `That was ${FIELD_POS[tappedZone as PositionKey]?.label ?? tappedZone} — check the green circle!`}
              </p>
              <p>{s.explanation}</p>
            </div>
          )}
        </div>

        {/* Next button */}
        {tapState !== null && (
          <button
            onClick={handleNext}
            className="cta-gold w-full text-[#0f2044] font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px] animate-pop-in"
          >
            {current + 1 >= total ? "See My Score →" : "Next Situation →"}
          </button>
        )}

        <p className="text-center text-white/20 text-[11px] mt-4">
          Ask your coach if a situation seems different from what you&apos;ve been taught!
        </p>
      </div>
    </div>
  );
}
