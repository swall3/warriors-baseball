// Server component gate — see rules/page.tsx for the full rationale.
// BACKUP_SCENARIOS is only imported here, server-side, and only handed to
// the client game when playerDevGamesAccess() allows it.
import { requireCoach } from "@/lib/coach/auth";
import { playerDevGamesAccess } from "@/lib/access/games";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import PositionGame from "./PositionGame";
import LockedGameTeaser from "@/components/games/LockedGameTeaser";

export default async function PositionPage() {
  const session = await requireCoach();
  const access = await playerDevGamesAccess(session);

  if (!access.allowed) {
    return (
      <LockedGameTeaser
        icon="◇"
        title="Where Do I Go?"
        detail="Pick your position. Learn your job before the next pitch."
        meta="Practice at your pace"
      />
    );
  }

  return <PositionGame scenarios={BACKUP_SCENARIOS} />;
}
