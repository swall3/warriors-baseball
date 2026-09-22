// Server wrapper for the hub. BACKUP_SCENARIOS is only imported here (for
// its length, shown as a card's rep count) — never in the client hub
// component, so the full pool doesn't ship to visitors just for browsing
// the games list. Also resolves player_dev_games access once so the hub can
// label the three membership-gated cards without re-deriving it per card.
import { requireCoach } from "@/lib/coach/auth";
import { playerDevGamesAccess } from "@/lib/access/games";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import GamesHub from "./GamesHub";

export default async function GamesPage() {
  const session = await requireCoach();
  const access = await playerDevGamesAccess(session);
  return (
    <GamesHub backupCount={BACKUP_SCENARIOS.length} locked={!access.allowed} />
  );
}
