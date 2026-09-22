// Server component — the free public sample for the games library
// (SEATS-AND-GAME-ACCESS.md Decision 2). Unlike the other three games, this
// route stays open to anonymous visitors; the "cap" is that only TODAY's
// single scenario (computed server-side, deterministically, from the
// calendar date — never a client-supplied value) is ever sent to the
// browser, not the full ~200-scenario BACKUP_SCENARIOS pool. Combined with
// the existing one-play-per-day UX (gameStorage's hasPlayedToday), that's a
// genuinely limited sample: one question, once a day, same for everyone.
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import { getDailyIndex } from "@/lib/gameStorage";
import DailyGame from "./DailyGame";

// Without this, Next.js has no reason to treat a page with no cookies()/
// headers() call as dynamic — it would prerender once at build time and
// bake in whatever day the build happened to run on, serving that same
// scenario forever. The cap only works if "today" is actually evaluated on
// every request.
export const dynamic = "force-dynamic";

export default function DailyPage() {
  const todayIndex = getDailyIndex(BACKUP_SCENARIOS.length);
  const scenario = BACKUP_SCENARIOS[todayIndex];
  return <DailyGame scenario={scenario} />;
}
