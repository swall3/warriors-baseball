import { coachTeamIds, orgAdmin } from "@/lib/access/policy";
import { client, LiveError } from "@/lib/coach/live/store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const db = client();
    const [org, teams, players] = await Promise.all([
      db
        .from("organizations")
        .select("id,name,short_name,branding")
        .eq("id", session.orgId)
        .eq("active", true)
        .maybeSingle(),
      db
        .from("teams")
        .select("id,name")
        .eq("kind", "own")
        .eq("org_id", session.orgId)
        .order("name"),
      db
        .from("players")
        .select("id,team_id,display_name,jersey_number")
        .eq("org_id", session.orgId)
        .eq("active", true)
        .order("display_name"),
    ]);
    if (org.error || teams.error || players.error)
      throw new LiveError(
        "Unable to load your organization. Check the connection and retry.",
        503,
      );
    if (!org.data) throw new LiveError("Organization unavailable", 403);
    return reply({
      ok: true,
      organization: org.data,
      role: session.role,
      teams: (teams.data ?? []).filter(
        (t) =>
          coachTeamIds(session) === null ||
          coachTeamIds(session)!.includes(t.id),
      ),
      players: (players.data ?? []).filter(
        (p) =>
          coachTeamIds(session) === null ||
          coachTeamIds(session)!.includes(p.team_id),
      ),
      orgRole: session.orgRole,
      personalAccount: !!session.userId,
      familyAccess: Object.values(session.teamRoles ?? {}).includes("parent"),
      canManageOrganization: orgAdmin(session),
    });
  } catch (e) {
    return failure(e);
  }
}
