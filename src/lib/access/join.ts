import { accessDb } from "./identity";

export const validJoinToken = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export async function activeJoinLink(token: string) {
  if (!validJoinToken(token)) return null;
  const db = accessDb();
  const { data: link, error } = await db
    .from("join_links")
    .select("token,org_id,team_id,kind,expires_at")
    .eq("token", token)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !link) return null;
  const [org, team] = await Promise.all([
    db.from("organizations").select("name,active,account_access_enabled")
      .eq("id", link.org_id).maybeSingle(),
    link.team_id
      ? db.from("teams").select("name,kind")
          .eq("org_id", link.org_id).eq("id", link.team_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (org.error || !org.data?.active || !org.data.account_access_enabled ||
    team.error || (link.team_id && team.data?.kind !== "own")) return null;
  return {
    token: link.token as string,
    orgId: link.org_id as string,
    teamId: link.team_id as string | null,
    kind: link.kind as "parent" | "coach",
    orgName: org.data.name as string,
    teamName: (team.data?.name as string | undefined) ?? null,
    expiresAt: link.expires_at as string,
  };
}
