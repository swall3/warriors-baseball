import type { CoachSession } from "@/lib/coach/session";

export const orgAdmin = (s: CoachSession) =>
  !!s.userId && ["owner", "manager"].includes(s.orgRole ?? "");
export const teamRole = (s: CoachSession, team: string) =>
  orgAdmin(s) ? "manager" : s.teamRoles?.[team];
export const canReadTeam = (s: CoachSession, team: string) =>
  !s.userId || orgAdmin(s) || !!s.teamRoles?.[team];
export const canCoachTeam = (s: CoachSession, team: string) =>
  !s.userId
    ? s.role !== "viewer"
    : orgAdmin(s) ||
      ["head_coach", "assistant_coach"].includes(s.teamRoles?.[team] ?? "");
export const visibleTeamIds = (s: CoachSession) =>
  !s.userId || orgAdmin(s) ? null : Object.keys(s.teamRoles ?? {});
export const coachTeamIds = (s: CoachSession) =>
  !s.userId || orgAdmin(s)
    ? null
    : Object.entries(s.teamRoles ?? {})
        .filter(([, role]) => role !== "parent")
        .map(([id]) => id);
export const isFamilyOnly = (s: CoachSession) =>
  !!s.userId &&
  !orgAdmin(s) &&
  !Object.values(s.teamRoles ?? {}).some((r) => r !== "parent");
