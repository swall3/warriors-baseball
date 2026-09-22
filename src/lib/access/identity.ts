import { createClient } from "@supabase/supabase-js";
import type { CoachSession } from "@/lib/coach/session";

export const IDENTITY_COOKIE = "iw_account";
export const ORG_COOKIE = "iw_organization";
export function accessDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
export async function verifiedIdentity(token?: string) {
  if (!token) return null;
  const { data, error } = await accessDb().auth.getUser(token);
  return !error && data.user?.email_confirmed_at && !data.user.is_anonymous
    ? data.user
    : null;
}
export async function accountSession(
  token: string,
  orgId?: string,
): Promise<CoachSession | null> {
  const user = await verifiedIdentity(token);
  if (!user || !orgId) return null;
  const db = accessDb();
  const [member, org, teams, players] = await Promise.all([
    db
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle(),
    db.from("organizations").select("active").eq("id", orgId).maybeSingle(),
    db
      .from("team_members")
      .select("team_id,role")
      .eq("org_id", orgId)
      .eq("user_id", user.id),
    db
      .from("parent_players")
      .select("player_id")
      .eq("org_id", orgId)
      .eq("user_id", user.id),
  ]);
  if (member.error || org.error || teams.error || players.error)
    throw new Error("Account access unavailable");
  if (!org.data?.active || !member.data) return null;
  const admin = ["owner", "manager"].includes(member.data.role);
  return {
    orgId,
    userId: user.id,
    orgRole: member.data.role,
    role: admin
      ? "owner"
      : teams.data.some((t) => t.role !== "parent")
        ? "coach"
        : "viewer",
    teamRoles: Object.fromEntries(teams.data.map((t) => [t.team_id, t.role])),
    playerIds: players.data.map((p) => p.player_id),
  };
}
export async function legacyAllowed(orgId: string) {
  if (!process.env.SUPABASE_URL) return process.env.NODE_ENV !== "production";
  const { data, error } = await accessDb()
    .from("organizations")
    .select("active,account_access_enabled")
    .eq("id", orgId)
    .maybeSingle();
  return !error && !!data?.active && !data.account_access_enabled;
}
