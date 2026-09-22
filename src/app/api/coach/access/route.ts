import { randomBytes, createHash } from "node:crypto";
import { sessionFor, reply, failure } from "@/lib/coach/live/http";
import { LiveError } from "@/lib/coach/live/store";
import { accessDb } from "@/lib/access/identity";
import { orgAdmin, coachTeamIds } from "@/lib/access/policy";
import { sendEmail } from "@/lib/notifications/message";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId)
      return reply(
        { error: "Sign in with your personal email to manage people." },
        403,
      );
    const db = accessDb(),
      ids = coachTeamIds(s),
      admin = orgAdmin(s);
    const [org, teams, orgMembers, teamMembers, invites, audit] =
      await Promise.all([
        db
          .from("organizations")
          .select("id,name,account_access_enabled")
          .eq("id", s.orgId)
          .single(),
        db
          .from("teams")
          .select("id,name")
          .eq("org_id", s.orgId)
          .eq("kind", "own"),
        admin
          ? db.from("org_members").select("user_id,role").eq("org_id", s.orgId)
          : Promise.resolve({ data: [], error: null }),
        db
          .from("team_members")
          .select("team_id,user_id,role")
          .eq("org_id", s.orgId),
        db
          .from("access_invitations")
          .select(
            "id,team_id,email,role,created_by,created_at,expires_at,accepted_at,revoked_at",
          )
          .eq("org_id", s.orgId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(200),
        admin
          ? db
              .from("access_audit")
              .select("id,action,actor_id,target_id,team_id,created_at")
              .eq("org_id", s.orgId)
              .order("id", { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [], error: null }),
      ]);
    if (
      [org, teams, orgMembers, teamMembers, invites, audit].some((r) => r.error)
    )
      throw new LiveError("Unable to load team access.", 503);
    const members = (teamMembers.data ?? []).filter(
      (m) => ids === null || ids.includes(m.team_id),
    );
    const users = [
      ...new Set([
        ...members.map((m) => m.user_id),
        ...(orgMembers.data ?? []).map((m) => m.user_id),
      ]),
    ];
    const people = await Promise.all(
      users.map(async (id) => {
        const { data, error } = await db.auth.admin.getUserById(id);
        if (error) throw new LiveError("Unable to load member accounts.", 503);
        return { id, email: data.user.email };
      }),
    );
    return reply({
      organization: org.data,
      userId: s.userId,
      orgRole: s.orgRole,
      teamRoles: s.teamRoles,
      teams: teams.data?.filter((t) => ids === null || ids.includes(t.id)),
      orgMembers: orgMembers.data,
      members,
      people,
      invites: invites.data?.filter(
        (i) =>
          admin ||
          i.created_by === s.userId ||
          s.teamRoles?.[i.team_id] === "head_coach",
      ),
      audit: audit.data,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const s = await sessionFor(request, true);
    if (!s.userId)
      throw new LiveError("Sign in with your personal email first.", 403);
    const b = await request.json();
    if (
      ![
        "enable",
        "create_team",
        "invite",
        "revoke_invite",
        "remove_member",
        "set_role",
        "transfer_team",
        "transfer_org",
      ].includes(b.action)
    )
      throw new LiveError("Choose an access action.", 400);
    const token =
      b.action === "invite" ? randomBytes(32).toString("base64url") : null;
    const payload = {
      teamId: b.teamId || null,
      userId: b.userId,
      role: b.role,
      name: b.name,
      email: typeof b.email === "string" ? b.email.trim().toLowerCase() : null,
      playerId: b.playerId,
      invitationId: b.invitationId,
      tokenHash: token
        ? createHash("sha256").update(token).digest("hex")
        : null,
    };
    const result = await accessDb().rpc("manage_team_access", {
      p_org: s.orgId,
      p_actor: s.userId,
      p_action: b.action,
      p_data: payload,
    });
    if (result.error) {
      // Only user-facing P0001 validation messages are exposed; SQL/constraint details stay private.
      throw new LiveError(
        result.error.code === "P0001"
          ? result.error.message
          : "Unable to update access. A team name, membership, or head-coach assignment may already exist.",
        409,
      );
    }
    if (!token) return reply(result.data);
    const origin = new URL(
      process.env.BILLING_APP_URL || "https://inningwise.com",
    );
    if (origin.protocol !== "https:" && origin.hostname !== "localhost")
      throw new LiveError("Invitation email address is not configured.", 503);
    const link = origin.origin + "/account#invite=" + token;
    const text = `You have been invited to InningWise as ${String(b.role).replaceAll("_", " ")}. Sign in with ${payload.email} to accept. This invitation expires in 7 days.\n\n${link}\n\nIf you were not expecting this invitation, you can ignore it.`;
    let emailAccepted = false;
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        await sendEmail(
          {
            from: process.env.EMAIL_FROM,
            to: [payload.email!],
            subject: "Your InningWise team invitation",
            text,
            html: `<p>You have been invited to join a team on InningWise.</p><p><a href="${link}">Sign in and accept your invitation</a></p><p>Use the email address that received this invitation. The link expires in 7 days.</p>`,
          },
          `invite-${result.data.invitationId}`,
          process.env.RESEND_API_KEY,
        );
        emailAccepted = true;
      } catch {
        /* The saved invitation can still be shared; creating another revokes this link. */
      }
    }
    return reply({ ...result.data, inviteLink: link, emailAccepted });
  } catch (e) {
    return failure(e);
  }
}
