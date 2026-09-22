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

// player_dev_games capability (SEATS-AND-GAME-ACCESS.md Decision 2). The
// daily-drill public sample aside, the games library is a paid app feature:
// any resolved session is "a signed-in member" here — an account session
// (coach or linked parent, s.userId set) always qualifies, same as the
// legacy passcode bridge that canCoachTeam already treats as a real coach
// when it isn't explicitly a read-only "viewer" cookie. Only a fully
// anonymous visitor (no session) or a viewer-only legacy cookie are
// excluded. Org/team billing standing is layered on top in
// access/games.ts, which needs a DB read this pure predicate deliberately
// does not perform.
export const canPlayGames = (s: CoachSession | null) =>
  !!s && (!!s.userId || s.role !== "viewer");
