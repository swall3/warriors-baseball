// player_dev_games capability — SEATS-AND-GAME-ACCESS.md Decision 2.
//
// Full games library (rules quiz, backup drill, position practice) requires
// a signed-in member whose team/org is in good standing. This composes two
// things that deliberately live in different files:
//
//   - canPlayGames() in access/policy.ts — the pure "is this a real member"
//     predicate, same shape as canCoachTeam/isFamilyOnly.
//   - teamAccess() in billing/policy.ts — the existing pilot-vs-enforced
//     billing decision, unchanged, reused rather than reinvented.
//
// This file is the glue: it reads whichever of the member's teams has a
// billing row and asks teamAccess() the same question billing/server.ts's
// assertCanStartGame() already asks for live games. It intentionally does
// NOT introduce org-level seat billing (SEATS-AND-GAME-ACCESS.md Decision 1)
// — that is a separate, not-yet-implemented decision owned elsewhere; this
// only reads the per-team `team_billing` rows that already exist.
import type { CoachSession } from "@/lib/coach/session";
import { canPlayGames, orgAdmin } from "@/lib/access/policy";
import { rowFor, type BillingRow } from "@/lib/billing/server";
import { teamAccess } from "@/lib/billing/policy";

export type GamesAccess = {
  allowed: boolean;
  reason:
    | "signed_out"
    | "pilot"
    | "legacy_session"
    | "org_admin"
    | "good_standing"
    | "billing_required";
};

type BillingLookup = (orgId: string, teamId: string) => Promise<BillingRow | null>;

export async function playerDevGamesAccess(
  session: CoachSession | null,
  lookup: BillingLookup = rowFor,
): Promise<GamesAccess> {
  if (!canPlayGames(session)) return { allowed: false, reason: "signed_out" };
  const s = session!;

  // BILLING_ENFORCE stays off for the current pilot launch posture
  // (TEAM-BILLING.md) — mirror teamAccess(null, false) exactly: any signed-in
  // member gets full access while enforcement is off.
  if (process.env.BILLING_ENFORCE !== "true")
    return { allowed: true, reason: "pilot" };

  // The MT-2/MT-3 passcode bridge has no userId and no per-team roster to
  // check billing rows against — it already gets a blanket pass in
  // authorize.ts's route policy for the same reason. Treat it the same way
  // here rather than inventing a stricter rule this release doesn't need.
  if (!s.userId) return { allowed: true, reason: "legacy_session" };

  if (orgAdmin(s)) return { allowed: true, reason: "org_admin" };

  const teamIds = Object.keys(s.teamRoles ?? {});
  for (const teamId of teamIds) {
    const row = await lookup(s.orgId, teamId);
    if (teamAccess(row, true).canStartGame)
      return { allowed: true, reason: "good_standing" };
  }
  return { allowed: false, reason: "billing_required" };
}
