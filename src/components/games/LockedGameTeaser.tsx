import Link from "next/link";
import Image from "next/image";

// Server-renderable teaser shown in place of a player-development game
// (rules quiz, backup drill, position practice) for a visitor who does not
// pass playerDevGamesAccess() — SEATS-AND-GAME-ACCESS.md Decision 2. Plain
// markup, no client JS: nothing here needs interactivity, and keeping it a
// server component means the locked route never even has a reason to load a
// client bundle that could import the question pool.
//
// Reuses the same dark in-game skin as the games themselves (training.css's
// `.training-surface` overrides — game-panel, cta-gold, min-h-screen) rather
// than inventing new styling, per the "no new CSS tricks" brief.
export default function LockedGameTeaser({
  title,
  detail,
  meta,
  icon,
}: {
  title: string;
  detail: string;
  meta: string;
  icon: string;
}) {
  return (
    <div className="min-h-screen px-3 py-5">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Link
            href="/games"
            aria-label="Back to training games"
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 text-lg flex items-center justify-center transition-colors shrink-0"
          >
            ‹
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="InningWise home"
          >
            <Image
              src="/inningwise.svg"
              alt=""
              width={22}
              height={22}
              className="object-contain"
            />
            <span className="font-display text-white text-xs tracking-wide hidden sm:inline">
              InningWise
            </span>
          </Link>
        </div>

        <div className="game-panel rounded-3xl px-6 py-10 text-center shadow-xl">
          <div className="text-5xl mb-3" aria-hidden="true">
            {icon}
          </div>
          <p className="text-[#c9a84c] font-bold text-[10px] uppercase tracking-[0.3em] mb-2">
            Members Only
          </p>
          <h1 className="font-display text-white text-2xl mb-2 leading-snug">
            {title}
          </h1>
          <p className="text-white/60 text-sm mb-1">{detail}</p>
          <p className="text-white/40 text-xs mb-6">{meta}</p>

          <p className="text-white/70 text-[14px] leading-relaxed mb-6">
            Your team gets full access to every training game with
            InningWise — sign in with your coach or parent account to play.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/account"
              className="cta-gold block w-full text-center text-[#0f2044] font-extrabold text-sm uppercase tracking-wider py-4 rounded-[18px]"
            >
              Sign In →
            </Link>
            <Link
              href="/"
              className="block w-full text-center bg-white/10 hover:bg-white/20 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-2xl transition-colors"
            >
              Learn About InningWise
            </Link>
          </div>
        </div>

        <p className="text-center text-white/30 text-[11px] mt-4">
          Try the free{" "}
          <Link href="/games/daily" className="underline text-white/50">
            Play of the Day
          </Link>{" "}
          — no sign-in required.
        </p>
      </div>
    </div>
  );
}
