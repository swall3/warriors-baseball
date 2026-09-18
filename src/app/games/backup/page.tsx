"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS, BackupScenario } from "@/lib/gameData";

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

type TapState = "correct" | "wrong" | null;

const FIELD_POS: Record<string, { x: number; y: number; label: string }> = {
  LF:  { x: 80,  y: 58,  label: "LF"  },
  CF:  { x: 200, y: 26,  label: "CF"  },
  RF:  { x: 320, y: 58,  label: "RF"  },
  SS:  { x: 122, y: 158, label: "SS"  },
  "2B":{ x: 278, y: 158, label: "2B"  },
  "1B":{ x: 366, y: 196, label: "1B"  },
  "3B":{ x: 34,  y: 196, label: "3B"  },
  P:   { x: 200, y: 210, label: "P"   },
  C:   { x: 200, y: 350, label: "C"   },
};

const BASES = {
  home:   { x: 200, y: 336 },
  first:  { x: 322, y: 212 },
  second: { x: 200, y: 88  },
  third:  { x: 78,  y: 212 },
};

function Diamond({
  runners,
  ballZone,
  targetZone,
  tappedZone,
  tapState,
  onTap,
  interactive,
}: {
  runners: { first: boolean; second: boolean; third: boolean };
  ballZone: string;
  targetZone?: string;
  tappedZone?: string | null;
  tapState?: TapState;
  onTap?: (zone: string) => void;
  interactive?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 400 390"
      className="w-full max-w-sm mx-auto"
      aria-label="Baseball field — tap a player circle"
    >
      <defs>
        {/* Fair-territory clip — upward wedge + small catcher box below home */}
        <clipPath id="fair-clip">
          <path d="M 200,336 L 0,133 L 0,0 L 400,0 L 400,133 Z M 200,336 L 20,390 L 380,390 Z" />
        </clipPath>
        <filter id="glow-gold" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="glow-green" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.35"/>
        </filter>
      </defs>

      {/* ── 1. Foul territory base ── */}
      <rect width={400} height={390} rx={18} fill="#16291d" />

      {/* ── 2. Fair territory ── */}
      <polygon points="200,336 0,133 0,0 400,0 400,133" fill="#1f4a24" />
      <polygon points="200,336 20,390 380,390" fill="#1f4a24" />

      {/* ── 3. Mowing arcs — centered at home, clipped to fair territory ── */}
      <g clipPath="url(#fair-clip)" opacity={0.9}>
        <circle cx={200} cy={336} r={240} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
        <circle cx={200} cy={336} r={300} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
        <circle cx={200} cy={336} r={360} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={16} />
      </g>

      {/* ── 4. Outfield wall arc ── */}
      <path d="M 0,133 Q 200,-28 400,133" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={3} />

      {/* ── 5. Foul lines ── */}
      <line x1={200} y1={336} x2={0} y2={133} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />
      <line x1={200} y1={336} x2={400} y2={133} stroke="rgba(255,255,255,0.55)" strokeWidth={2} />

      {/* ── 6. Infield dirt circle (clipped to fair territory) ── */}
      <circle cx={200} cy={210} r={152} fill="#9c7045" clipPath="url(#fair-clip)" />

      {/* ── 7. Infield grass square ── */}
      <polygon points="200,96 314,212 200,328 86,212" fill="#236327" />

      {/* ── 8. Basepath chalk lines ── */}
      {[
        [BASES.home, BASES.first],
        [BASES.first, BASES.second],
        [BASES.second, BASES.third],
        [BASES.third, BASES.home],
      ].map(([a, b], i) => (
        <line
          key={i}
          x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="rgba(255,255,255,0.80)"
          strokeWidth={2}
        />
      ))}

      {/* ── 9. Pitcher's mound ── */}
      <circle cx={200} cy={210} r={18} fill="#8a5e38" />
      <rect x={194} y={207} width={12} height={6} rx={1.5} fill="#e8e8e8" opacity={0.85} />

      {/* ── Bases 1-3 ── */}
      {[
        { pos: BASES.first,  occ: runners.first  },
        { pos: BASES.second, occ: runners.second },
        { pos: BASES.third,  occ: runners.third  },
      ].map(({ pos, occ }, i) => (
        <rect
          key={i}
          x={pos.x - 10} y={pos.y - 10}
          width={20} height={20}
          transform={`rotate(45, ${pos.x}, ${pos.y})`}
          fill={occ ? "#ff4040" : "white"}
          stroke={occ ? "#cc2020" : "#ccc"}
          strokeWidth={1.5}
          filter="url(#drop-shadow)"
        />
      ))}

      {/* Runner indicator dots */}
      {runners.first  && <circle cx={BASES.first.x  + 18} cy={BASES.first.y  - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}
      {runners.second && <circle cx={BASES.second.x + 18} cy={BASES.second.y - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}
      {runners.third  && <circle cx={BASES.third.x  - 18} cy={BASES.third.y  - 18} r={7} fill="#ff3333" stroke="white" strokeWidth={2} />}

      {/* ── Home plate ── */}
      <polygon
        points={`
          ${BASES.home.x - 11},${BASES.home.y - 7}
          ${BASES.home.x + 11},${BASES.home.y - 7}
          ${BASES.home.x + 11},${BASES.home.y + 1}
          ${BASES.home.x},     ${BASES.home.y + 11}
          ${BASES.home.x - 11},${BASES.home.y + 1}
        `}
        fill="white"
        filter="url(#drop-shadow)"
      />

      {/* ── Fielder position circles ── */}
      {Object.entries(FIELD_POS).map(([key, pos]) => {
        const isBall    = key === ballZone;
        const isTarget  = tapState !== null && key === targetZone;
        const isWrong   = tappedZone === key && tapState === "wrong" && key !== targetZone;
        const isNeutral = !isBall && !isTarget && !isWrong;

        let circleFill   = "rgba(15,32,68,0.82)";
        let circleStroke = "rgba(255,255,255,0.38)";
        let textFill     = "white";
        let glowFilter: string | undefined;

        if (isBall && tapState === null) {
          circleFill   = "#e8b800";
          circleStroke = "#ffd60a";
          textFill     = "#0f2044";
          glowFilter   = "url(#glow-gold)";
        } else if (isTarget) {
          circleFill   = "#16a34a";
          circleStroke = "#22c55e";
          glowFilter   = "url(#glow-green)";
        } else if (isWrong) {
          circleFill   = "#dc2626";
          circleStroke = "#ef4444";
        } else if (tapState !== null && isBall) {
          circleFill   = "#c8a020";
          circleStroke = "#e8c840";
          textFill     = "#0f2044";
        }

        const canTap = interactive && tapState === null;

        return (
          <g key={key}>
            {/* Animated ball-zone ring */}
            {isBall && tapState === null && (
              <circle
                cx={pos.x} cy={pos.y} r={28}
                fill="#ffd60a"
                opacity={0.22}
                className="animate-ping"
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}

            {/* BALL label pill under the ball zone */}
            {isBall && (
              <g style={{ pointerEvents: "none" }}>
                <rect
                  x={pos.x - 21} y={pos.y + 24}
                  width={42} height={15} rx={7.5}
                  fill="rgba(255,214,10,0.92)"
                />
                <text
                  x={pos.x} y={pos.y + 34.5}
                  textAnchor="middle"
                  fontSize={8.5} fontWeight="900" fill="#0f2044"
                  style={{ letterSpacing: "0.1em" }}
                >
                  BALL
                </text>
              </g>
            )}

            {/* Invisible large hit target for easier tapping */}
            {canTap && (
              <circle
                cx={pos.x} cy={pos.y} r={34}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => onTap?.(key)}
              />
            )}

            {/* Main circle */}
            <circle
              cx={pos.x} cy={pos.y} r={21}
              fill={circleFill}
              stroke={circleStroke}
              strokeWidth={2.5}
              filter={glowFilter}
              className={canTap ? "cursor-pointer" : undefined}
              onClick={canTap ? () => onTap?.(key) : undefined}
            />

            {/* Position label */}
            <text
              x={pos.x} y={pos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={key.length > 2 ? 9 : 10.5}
              fontWeight="800"
              fill={textFill}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {pos.label}
            </text>

            {/* ✓ on correct answer */}
            {isTarget && (
              <text
                x={pos.x + 16} y={pos.y - 16}
                fontSize={15} fontWeight="bold" fill="#22c55e"
                style={{ pointerEvents: "none" }}
              >
                ✓
              </text>
            )}

            {/* ✗ on wrong tap */}
            {isWrong && (
              <text
                x={pos.x + 16} y={pos.y - 16}
                fontSize={15} fontWeight="bold" fill="#ef4444"
                style={{ pointerEvents: "none" }}
              >
                ✗
              </text>
            )}
          </g>
        );
      })}

      {/* Runner legend */}
      {(runners.first || runners.second || runners.third) && (
        <>
          <circle cx={14} cy={376} r={6} fill="#ff3333" stroke="white" strokeWidth={1.5} />
          <text x={24} y={381} fontSize={10} fill="rgba(255,255,255,0.5)" style={{ userSelect: "none" }}>
            = runner on base
          </text>
        </>
      )}
    </svg>
  );
}

// ── Streak-to-praise map ──
const PRAISE = ["Nice! 👍", "Keep Rolling! 💪", "Hot Streak! 🔥", "On Fire! 🔥🔥", "WARRIOR! ⚡", "UNSTOPPABLE! ⭐"];
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
  const [shakeKey, setShakeKey] = useState(0);

  const scoreRef  = useRef(0);
  const pointsRef = useRef(0);
  const streakRef = useRef(0);
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
    scoreRef.current  = 0;
    pointsRef.current = 0;
    streakRef.current = 0;
  }, []);

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

    if (correct) {
      scoreRef.current += 1;
      const newStreak = streakRef.current + 1;
      streakRef.current = newStreak;
      const earned = Math.round(100 * getMultiplier(newStreak));
      pointsRef.current += earned;
      setScore(scoreRef.current);
      setPoints(pointsRef.current);
      setStreak(newStreak);
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
    return (
      <div className="min-h-screen bg-[#0f2044] px-4 py-12 flex flex-col items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-3xl p-8 text-center shadow-2xl animate-pop-in">
          <div className="text-6xl mb-3">{stars}</div>
          <h2 className="font-display text-[#0f2044] text-4xl mb-1">GREAT HUSTLE!</h2>
          {newHS && (
            <p className="text-[#8b1a2e] font-bold text-xs uppercase tracking-widest mb-2">🎉 New High Score!</p>
          )}
          <p className="text-gray-500 text-lg mb-1">
            <span className="font-bold text-[#0f2044]">{score}</span> / {total} correct
          </p>
          <p className="text-[#c9a84c] font-bold text-2xl mb-1">{points.toLocaleString()} pts</p>
          <p className="text-gray-400 text-sm mb-6">Best: {highScore.toLocaleString()} pts</p>

          <div className={`rounded-2xl p-4 mb-6 ${score === total ? "bg-green-50" : score >= Math.floor(total * 0.87) ? "bg-green-50" : score >= Math.floor(total * 0.60) ? "bg-amber-50" : "bg-red-50"}`}>
            {score === total && <p className="text-green-700 font-bold">🏆 Perfect! You know exactly where to be on every play!</p>}
            {score >= Math.floor(total * 0.87) && score < total && <p className="text-green-700 font-bold">Your coaches are going to love you out there!</p>}
            {score >= Math.floor(total * 0.60) && score < Math.floor(total * 0.87) && <p className="text-amber-700 font-bold">Good effort! Play again and those positions will stick!</p>}
            {score < Math.floor(total * 0.60) && <p className="text-red-700 font-bold">Keep practicing — these positions take time to learn!</p>}
            <p className="text-gray-400 text-xs mt-2">💡 Ask your coach about specific plays!</p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={init}
              className="bg-[#1a4a72] hover:bg-[#1f5a8a] active:scale-95 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg"
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
    <div className="min-h-screen bg-[#0f2044] px-3 py-5">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <Link href="/games" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
            ‹
          </Link>
          <div className="flex-1" />
          {streak >= 2 ? (
            <div className="streak-flame flex items-center gap-1.5 font-extrabold text-white text-sm rounded-full px-3.5 py-1.5">
              🔥 {streak}
            </div>
          ) : null}
          <div className="flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[#c9a84c] font-extrabold text-sm border-[1.5px]"
               style={{ background: "rgba(201,168,76,0.15)", borderColor: "rgba(201,168,76,0.35)" }}>
            ⚡ {points.toLocaleString()}
          </div>
          <div className="text-white/40 text-[13px] font-bold shrink-0">{current + 1}/{total}</div>
        </div>

        {/* Segmented progress bar */}
        <div className="flex gap-[3px] mb-4">
          {scenarios.map((_, i) => {
            const isDone = i < current || (i === current && tapState !== null);
            const isCurrent = i === current && tapState === null;
            return (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-white/10">
                {isDone && <div className="h-full w-full bg-[#c9a84c] rounded-full" />}
                {isCurrent && <div className="h-full w-3/5 bg-[#c9a84c] rounded-full animate-pulse" />}
              </div>
            );
          })}
        </div>

        {/* Situation chip */}
        <div className="bg-white/10 rounded-2xl px-4 py-2.5 mb-3">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-0.5">Situation</p>
          <p className="text-white font-bold text-[14px] leading-snug">{s.label}</p>
        </div>

        {/* Diamond area — relative so praise text can float over it */}
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
          className={`bg-white rounded-3xl px-5 py-5 shadow-xl mb-4 ${shakeKey > 0 && tapState === "wrong" ? "animate-shake-h" : ""}`}
        >
          <p className="text-[#1a4a72] text-[11px] font-bold uppercase tracking-widest mb-1.5">📍 Your Move</p>
          <h2 className="text-[#0f2044] text-[17px] font-bold leading-snug">
            {s.question}
          </h2>

          {/* Feedback after tap */}
          {tapState !== null && (
            <div
              className={`mt-4 rounded-2xl px-4 py-4 text-[14px] leading-relaxed animate-pop-in ${
                tapState === "correct" ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-bold mb-1">
                {tapState === "correct" ? "✅ Correct!" : `❌ That was ${FIELD_POS[tappedZone!]?.label ?? tappedZone} — check the green circle!`}
              </p>
              <p>{s.explanation}</p>
            </div>
          )}
        </div>

        {/* Next button */}
        {tapState !== null && (
          <button
            onClick={handleNext}
            className="cta-blue w-full text-white font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px] animate-pop-in"
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
