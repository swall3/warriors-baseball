// Server component gate — see rules/page.tsx for the full rationale.
// BACKUP_SCENARIOS is only imported here, server-side, and only handed to
// the client game when playerDevGamesAccess() allows it.
import { requireCoach } from "@/lib/coach/auth";
import { playerDevGamesAccess } from "@/lib/access/games";
import { BACKUP_SCENARIOS, CATEGORY_LABELS } from "@/lib/gameData";
import { QUIZ_SESSION_SIZE } from "@/lib/practice/sessions";
import BackupGame from "./BackupGame";
import LockedGameTeaser from "@/components/games/LockedGameTeaser";

export default async function BackupPage() {
  const session = await requireCoach();
  const access = await playerDevGamesAccess(session);

  if (!access.allowed) {
    return (
      <LockedGameTeaser
        icon="↗"
        title="Back Up Your Team"
        detail="Read the play and tap the teammate who needs to move."
        meta={`${BACKUP_SCENARIOS.length} situations · ${QUIZ_SESSION_SIZE} per session`}
      />
    );
  }

  return <BackupGame scenarios={BACKUP_SCENARIOS} skillLabels={CATEGORY_LABELS} />;
}
