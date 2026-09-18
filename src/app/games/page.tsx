"use client";

import Link from "next/link";
import { RULES_QUESTIONS, BACKUP_SCENARIOS } from "@/lib/gameData";

export default function GamesPage() {
  return (
    <div className="min-h-screen hub-bg px-4 py-14">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="text-center mb-9">
          {/* Gold logo ring */}
          <div className="w-[88px] h-[88px] mx-auto mb-4 rounded-full p-[3px]"
               style={{ background: "linear-gradient(135deg,#c9a84c 0%,#f0d070 50%,#c9a84c 100%)", boxShadow: "0 0 0 4px rgba(201,168,76,0.15), 0 8px 32px rgba(201,168,76,0.3)" }}>
            <div className="w-full h-full rounded-full bg-[#0f2044] flex items-center justify-center text-4xl">
              ⚾
            </div>
          </div>
          <p className="text-[#c9a84c] font-bold text-[10px] uppercase tracking-[0.3em] mb-2">
            Warriors Training Zone
          </p>
          <h1 className="font-display text-white text-6xl leading-[0.9] mb-2">PLAY &amp; LEARN</h1>
          <p className="text-white/45 text-sm font-medium">Level up your baseball IQ</p>
        </div>

        {/* Game Cards */}
        <div className="space-y-4">

          {/* Rules Quiz */}
          <Link href="/games/rules" className="block">
            <div className="tile-rules tile-3d relative overflow-hidden rounded-[24px] p-6 cursor-pointer">
              {/* shine */}
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-[24px] pointer-events-none"
                   style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.08) 0%,transparent 100%)" }} />
              {/* bg icon */}
              <div className="absolute -right-2 -bottom-3 text-[90px] leading-none opacity-[0.12] pointer-events-none -rotate-12 select-none">⚾</div>
              {/* stars */}
              <div className="absolute top-6 right-6 text-sm tracking-tight" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>⭐⭐⭐</div>

              <div className="relative">
                <span className="inline-block bg-white/15 text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full mb-2.5">Game 1</span>
                <h2 className="font-display text-white text-4xl leading-none mb-2">RULES QUIZ</h2>
                <p className="text-white/70 text-[13px] font-medium leading-snug mb-4 max-w-[240px]">
                  Test your baseball knowledge with 15 random questions. Earn bonus points for streaks!
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full">15 Questions</span>
                    <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full">🔥 Streaks</span>
                  </div>
                  <div className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center text-white text-lg">›</div>
                </div>
              </div>
            </div>
          </Link>

          {/* Backup Positions */}
          <Link href="/games/backup" className="block">
            <div className="tile-backup tile-3d relative overflow-hidden rounded-[24px] p-6 cursor-pointer">
              <div className="absolute inset-x-0 top-0 h-1/2 rounded-t-[24px] pointer-events-none"
                   style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.08) 0%,transparent 100%)" }} />
              <div className="absolute -right-2 -bottom-3 text-[90px] leading-none opacity-[0.12] pointer-events-none -rotate-12 select-none">📍</div>
              <div className="absolute top-6 right-6 text-sm tracking-tight" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}>⭐⭐</div>

              <div className="relative">
                <span className="inline-block bg-white/15 text-white/80 text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded-full mb-2.5">Game 2</span>
                <h2 className="font-display text-white text-4xl leading-none mb-2">BACKUP DRILL</h2>
                <p className="text-white/70 text-[13px] font-medium leading-snug mb-4 max-w-[240px]">
                  Tap the player on the field. Real game situations — know where to be!
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex gap-1.5">
                    <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full">{BACKUP_SCENARIOS.length} Scenarios</span>
                    <span className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full">👆 Tap Field</span>
                  </div>
                  <div className="w-9 h-9 bg-white/15 rounded-full flex items-center justify-center text-white text-lg">›</div>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer */}
        <div className="text-center mt-12">
          <Link href="/" className="text-white/30 hover:text-white/60 text-sm transition-colors">
            ← Back to Warriors site
          </Link>
          <p className="text-white/20 text-xs mt-3">East Cherokee Warriors Baseball</p>
        </div>
      </div>
    </div>
  );
}
