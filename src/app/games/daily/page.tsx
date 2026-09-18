"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import { Diamond, PositionKey, TapState } from "@/components/Diamond";
import { getDailyIndex, getDailyState, recordDailyPlay, recordAttempt, hasPlayedToday } from "@/lib/gameStorage";

export default function DailyPage() {
  const [ready, setReady] = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [tappedZone, setTappedZone] = useState<string | null>(null);
  const [tapState, setTapState] = useState<TapState>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [isNewStreak, setIsNewStreak] = useState(false);

  const todayIndex = getDailyIndex(BACKUP_SCENARIOS.length);
  const s = BACKUP_SCENARIOS[todayIndex];

  useEffect(() => {
    const played = hasPlayedToday();
    setAlreadyDone(played);
    const state = getDailyState();
    setStreak(state.streak);
    setBest(state.best);
    setReady(true);
  }, []);

  const handleTap = (zone: string) => {
    if (tapState !== null) return;
    const correct = zone === s.targetZone;
    setTappedZone(zone);
    setTapState(correct ? "correct" : "wrong");
    recordAttempt(s.targetZone as PositionKey, correct);
    const result = recordDailyPlay();
    setStreak(result.streak);
    setBest(result.best);
    setIsNewStreak(!result.alreadyPlayedToday);
  };

  if (!ready) return null;

  return (
    <div className="min-h-screen bg-[#0f2044] px-3 py-5">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/games" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0">
            ‹
          </Link>
          <Link href="/" className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity" aria-label="Warriors home">
            <Image src="/images/warriors/mascot.png" alt="" width={22} height={22} className="object-contain" />
            <span className="font-display text-white text-xs tracking-wide hidden sm:inline">WARRIORS</span>
          </Link>
          <div className="flex-1" />
          <div className="streak-flame flex items-center gap-1.5 font-extrabold text-white text-sm rounded-full px-3.5 py-1.5">
            🔥 {streak} day{streak === 1 ? "" : "s"}
          </div>
        </div>

        {/* Title card */}
        <div className="text-center mb-5">
          <p className="text-[#c9a84c] font-bold text-[10px] uppercase tracking-[0.3em] mb-2">Play of the Day</p>
          <h1 className="font-display text-white text-4xl leading-none">TODAY&apos;S PLAY</h1>
        </div>

        {alreadyDone && tapState === null ? (
          <div className="bg-white rounded-3xl px-6 py-10 text-center shadow-xl">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="font-display text-[#0f2044] text-2xl mb-2">Already Done for Today!</h2>
            <p className="text-gray-500 text-sm mb-1">You&apos;re on a <span className="font-bold text-[#8b1a2e]">{streak}-day</span> streak.</p>
            <p className="text-gray-400 text-xs mb-6">Best streak: {best} day{best === 1 ? "" : "s"}. Come back tomorrow for a new play!</p>
            <p className="text-gray-400 text-xs">Want more reps right now? Try the full Backup Drill.</p>
            <Link
              href="/games/backup"
              className="inline-block mt-4 bg-[#1a4a72] hover:bg-[#1f5a8a] active:scale-95 text-white font-bold text-sm uppercase tracking-wider px-6 py-3 rounded-2xl transition-all"
            >
              Backup Drill →
            </Link>
          </div>
        ) : (
          <>
            {/* Situation chip */}
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
                👆 Tap a player on the field
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

            {tapState !== null && isNewStreak && (
              <div className="bg-[#c9a84c]/15 border border-[#c9a84c]/40 rounded-2xl px-5 py-4 mb-4 text-center animate-pop-in">
                <p className="text-[#c9a84c] font-display text-2xl mb-1">🔥 {streak}-Day Streak!</p>
                <p className="text-white/50 text-xs">Come back tomorrow for a new play — same time, everyone gets the same one.</p>
              </div>
            )}

            {tapState !== null && (
              <Link
                href="/games"
                className="cta-gold block w-full text-center text-[#0f2044] font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px] animate-pop-in"
              >
                Back to Games →
              </Link>
            )}
          </>
        )}

        <p className="text-center text-white/20 text-[11px] mt-4">
          Ask your coach if a situation seems different from what you&apos;ve been taught!
        </p>
      </div>
    </div>
  );
}
