"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { RULES_QUESTIONS, RulesQuestion } from "@/lib/gameData";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function starRating(score: number, total: number) {
  const pct = score / total;
  if (pct >= 0.85) return "⭐⭐⭐";
  if (pct >= 0.60) return "⭐⭐";
  return "⭐";
}

const PRAISE = [
  "Nice! 👍",
  "Keep Rolling! 💪",
  "Hot Streak! 🔥",
  "On Fire! 🔥🔥",
  "WARRIOR! ⚡",
  "UNSTOPPABLE! ⭐",
];

const getMultiplier = (streak: number) =>
  streak >= 5 ? 3 : streak >= 3 ? 2 : streak >= 1 ? 1.5 : 1;

export default function RulesQuizPage() {
  const [questions, setQuestions] = useState<RulesQuestion[]>([]);
  const [current, setCurrent]     = useState(0);
  const [selected, setSelected]   = useState<number | null>(null);
  const [score, setScore]         = useState(0);
  const [points, setPoints]       = useState(0);
  const [streak, setStreak]       = useState(0);
  const [gameState, setGameState] = useState<"playing" | "done">("playing");
  const [highScore, setHighScore] = useState(0);
  const [newHS, setNewHS]         = useState(false);
  const [praiseText, setPraiseText]     = useState("");
  const [praiseKey, setPraiseKey]       = useState(0);
  const [praiseVisible, setPraiseVisible] = useState(false);
  const [wrongKey, setWrongKey]   = useState(0);
  const [wrongIdx, setWrongIdx]   = useState<number | null>(null);
  const [pointsGain, setPointsGain] = useState(0);

  const scoreRef  = useRef(0);
  const pointsRef = useRef(0);
  const streakRef = useRef(0);
  const praiseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const init = useCallback(() => {
    setQuestions(shuffle(RULES_QUESTIONS).slice(0, 15));
    setCurrent(0);
    setSelected(null);
    setScore(0);
    setPoints(0);
    setStreak(0);
    setGameState("playing");
    setNewHS(false);
    setPraiseVisible(false);
    scoreRef.current  = 0;
    pointsRef.current = 0;
    streakRef.current = 0;
  }, []);

  useEffect(() => {
    init();
    const hs = localStorage.getItem("warriors-rules-pts");
    if (hs) setHighScore(parseInt(hs, 10));
  }, [init]);

  const handleAnswer = (idx: number) => {
    if (selected !== null) return;
    setSelected(idx);

    const q = questions[current];
    if (idx === q.correct) {
      scoreRef.current += 1;
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      const mult   = getMultiplier(newStreak);
      const earned = Math.round(100 * mult);
      pointsRef.current += earned;
      setScore(scoreRef.current);
      setPoints(pointsRef.current);
      setStreak(newStreak);
      setPointsGain(earned);
      const msg = PRAISE[Math.min(newStreak - 1, PRAISE.length - 1)];
      setPraiseText(msg);
      setPraiseKey(k => k + 1);
      setPraiseVisible(true);
      if (praiseTimer.current) clearTimeout(praiseTimer.current);
      praiseTimer.current = setTimeout(() => setPraiseVisible(false), 1100);
    } else {
      streakRef.current = 0;
      setStreak(0);
      setWrongIdx(idx);
      setWrongKey(k => k + 1);
    }
  };

  const handleNext = () => {
    const total = questions.length;
    if (current + 1 >= total) {
      const finalPts = pointsRef.current;
      const hs = parseInt(localStorage.getItem("warriors-rules-pts") || "0", 10);
      if (finalPts > hs) {
        localStorage.setItem("warriors-rules-pts", String(finalPts));
        setHighScore(finalPts);
        setNewHS(true);
      }
      setGameState("done");
    } else {
      setCurrent(c => c + 1);
      setSelected(null);
      setWrongIdx(null);
    }
  };

  if (questions.length === 0) return null;

  const total = questions.length;
  const q     = questions[current];
  const isCorrect = selected === q.correct;

  // ── Done screen ──
  if (gameState === "done") {
    const stars = starRating(score, total);
    return (
      <div className="min-h-screen bg-[#0f2044] px-4 py-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-2xl animate-pop-in">
          <div className="text-6xl mb-3">{stars}</div>
          <h2 className="font-display text-[#0f2044] text-4xl mb-1">NICE WORK!</h2>
          {newHS && (
            <p className="text-[#8b1a2e] font-bold text-xs uppercase tracking-widest mb-2">🎉 New High Score!</p>
          )}
          <p className="text-gray-500 text-lg mb-1">
            <span className="font-bold text-[#0f2044]">{score}</span> / {total} correct
          </p>
          <p className="text-[#c9a84c] font-bold text-2xl mb-1">{points.toLocaleString()} pts</p>
          <p className="text-gray-400 text-sm mb-6">Best: {highScore.toLocaleString()} pts</p>

          <div className={`rounded-2xl p-4 mb-6 ${score === total ? "bg-green-50" : score >= Math.floor(total * 0.85) ? "bg-green-50" : score >= Math.floor(total * 0.60) ? "bg-amber-50" : "bg-red-50"}`}>
            {score === total && <p className="text-green-700 font-bold">🏆 Perfect score! You know your baseball rules cold!</p>}
            {score >= Math.floor(total * 0.85) && score < total && <p className="text-green-700 font-bold">Almost perfect! You really know your stuff!</p>}
            {score >= Math.floor(total * 0.60) && score < Math.floor(total * 0.85) && <p className="text-amber-700 font-bold">Good job! Keep studying and you&apos;ll be a baseball expert!</p>}
            {score < Math.floor(total * 0.60) && <p className="text-red-700 font-bold">Keep practicing! Try again and beat your score!</p>}
            {streak > 0 && <p className="text-gray-500 text-sm mt-2">Best streak during this game: you had some great runs! 🔥</p>}
          </div>

          <div className="bg-[#0f2044]/5 rounded-2xl py-3 px-4 mb-6">
            <p className="text-gray-500 text-xs font-semibold">HOW POINTS WORK</p>
            <p className="text-gray-600 text-sm mt-1">Streak of 1–2: 1.5× · Streak of 3–4: 2× · Streak 5+: 3× 🔥</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={init}
              className="bg-[#8b1a2e] hover:bg-[#a82037] active:scale-95 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg"
            >
              Play Again
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
    <div className="min-h-screen bg-[#0f2044] px-4 py-6">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/games" aria-label="Back to training games" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
            ‹
          </Link>
          <Link href="/" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" aria-label="Warriors home">
            <Image src="/images/warriors/mascot.png" alt="" width={22} height={22} className="object-contain" />
            <span className="font-display text-white text-xs tracking-wide hidden sm:inline">WARRIORS</span>
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

        {/* Segmented progress bar */}
        <div className="flex gap-[3px] mb-6">
          {questions.map((_, i) => {
            const isDone = i < current || (i === current && selected !== null);
            const isCurrent = i === current && selected === null;
            return (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                {isDone && <div className="h-full w-full bg-[#c9a84c] rounded-full" />}
                {isCurrent && <div className="h-full w-3/5 bg-[#c9a84c] rounded-full animate-pulse" />}
              </div>
            );
          })}
        </div>

        {/* Question card — relative for floating praise */}
        <div className="relative">

          {/* Floating praise */}
          {praiseVisible && (
            <div
              key={praiseKey}
              className="absolute inset-x-0 -top-2 flex justify-center pointer-events-none animate-float-up"
              style={{ zIndex: 10 }}
            >
              <span className="bg-[#c9a84c] text-[#0f2044] font-display text-xl px-7 py-2 rounded-full shadow-xl">
                {praiseText}
              </span>
            </div>
          )}

          <div className="game-panel rounded-3xl p-6 shadow-xl mb-4">
            <p className="font-display text-[#c9a84c] text-[13px] tracking-widest mb-3">
              ⚾ QUESTION {current + 1}
            </p>
            <h2 className="text-white text-[18px] font-bold leading-snug mb-5">
              {q.question}
            </h2>

            {/* Answer buttons */}
            <div className="space-y-2.5">
              {q.options.map((opt, i) => {
                const isSelected = selected === i;
                const isCorrectOpt = i === q.correct;

                let style = "tactile-dark w-full flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl font-semibold text-[15px] ";
                let chipStyle = "w-[30px] h-[30px] rounded-[10px] flex items-center justify-center text-[13px] font-extrabold shrink-0 transition-colors ";

                if (selected === null) {
                  chipStyle += "bg-white/10 text-white/70";
                } else if (isCorrectOpt) {
                  style += "tactile-dark-correct animate-pop-in ";
                  chipStyle += "bg-green-500 text-white";
                } else if (isSelected && !isCorrectOpt) {
                  style += `tactile-dark-wrong ${wrongKey > 0 && wrongIdx === i ? "animate-shake-h" : ""} `;
                  chipStyle += "bg-red-500 text-white";
                } else {
                  style += "opacity-45 ";
                  chipStyle += "bg-white/10 text-white/70";
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    className={style}
                    disabled={selected !== null}
                  >
                    <span className={chipStyle}>{["A", "B", "C", "D"][i]}</span>
                    <span className="flex-1">{opt}</span>
                    {selected !== null && isCorrectOpt && <span className="text-lg">✓</span>}
                    {selected !== null && isSelected && !isCorrectOpt && <span className="text-lg">✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Explanation */}
            {selected !== null && (
              <div
                className={`mt-5 rounded-2xl px-5 py-4 text-[14px] leading-relaxed animate-pop-in ${
                  isCorrect ? "feedback-correct" : "feedback-wrong"
                }`}
              >
                <p className="font-bold mb-1.5 flex items-center gap-2">
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-black shrink-0 ${isCorrect ? "feedback-badge-correct" : "feedback-badge-wrong"}`}>
                    {isCorrect ? "✓" : "!"}
                  </span>
                  {isCorrect ? "Correct!" : "Not quite!"}
                </p>
                <p>{q.explanation}</p>
              </div>
            )}
          </div>
        </div>

        {/* Next button */}
        {selected !== null && (
          <button
            onClick={handleNext}
            className="cta-gold w-full text-[#0f2044] font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px] animate-pop-in"
          >
            {current + 1 >= total ? "See My Score →" : "Next Question →"}
          </button>
        )}

        {/* Streak multiplier hint */}
        {selected === null && streak >= 2 && (
          <p className="text-center text-amber-400/70 text-xs mt-3 font-semibold">
            {streak >= 5 ? "3× POINTS on next correct!" : streak >= 3 ? "2× POINTS on next correct!" : "1.5× POINTS on next correct!"}
          </p>
        )}
      </div>
    </div>
  );
}
