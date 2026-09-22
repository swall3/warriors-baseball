// Server component: resolves player_dev_games access (SEATS-AND-GAME-ACCESS.md
// Decision 2) before the question pool is ever touched. `RULES_QUESTIONS`
// (with correct answers) is only imported here, on the server — it is
// handed to the client game as a prop solely on the allowed branch, so a
// denied/anonymous visitor's response never contains it and no client
// bundle for this route references @/lib/gameData at all.
import { requireCoach } from "@/lib/coach/auth";
import { playerDevGamesAccess } from "@/lib/access/games";
import { RULES_QUESTIONS } from "@/lib/gameData";
import RulesGame from "./RulesGame";
import LockedGameTeaser from "@/components/games/LockedGameTeaser";

export default async function RulesQuizPage() {
  const session = await requireCoach();
  const access = await playerDevGamesAccess(session);

  if (!access.allowed) {
    return (
      <LockedGameTeaser
        icon="⚾"
        title="Know the Rules"
        detail="Make the call. Build your baseball IQ one question at a time."
        meta="15 questions per round"
      />
    );
  }

  return <RulesGame questions={RULES_QUESTIONS} />;
}
