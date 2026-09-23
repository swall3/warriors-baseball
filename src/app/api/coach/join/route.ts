import { randomBytes } from "node:crypto";
import { accessDb } from "@/lib/access/identity";
import { orgAdmin } from "@/lib/access/policy";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
import { LiveError } from "@/lib/coach/live/store";

export async function GET(request: Request) {
  try {
    const s = await sessionFor(request);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const admin = orgAdmin(s);
    const coachTeams = Object.entries(s.teamRoles ?? {})
      .filter(([, role]) => ["head_coach", "assistant_coach"].includes(role))
      .map(([id]) => id);
    if (!admin && !coachTeams.length) throw new LiveError("Coach access required.", 403);
    const db = accessDb();
    if (new URL(request.url).searchParams.get("summary") === "1") {
      let query = db.from("join_requests").select("id", { count: "exact", head: true })
        .eq("org_id", s.orgId).eq("status", "pending");
      if (!admin) query = query.eq("kind", "parent").in("team_id", coachTeams);
      const { count, error } = await query;
      if (error) throw new LiveError("Unable to load review count.", 503);
      return reply({ pendingCount: count ?? 0 });
    }
    const [links, requests] = await Promise.all([
      db.from("join_links").select("token,team_id,kind,expires_at,created_at")
        .eq("org_id", s.orgId).is("revoked_at", null)
        .gt("expires_at", new Date().toISOString()),
      db.from("join_requests")
        .select("id,team_id,kind,child_name,note,user_id,created_at")
        .eq("org_id", s.orgId).eq("status", "pending")
        .order("created_at", { ascending: true }).limit(100),
    ]);
    if (links.error || requests.error) throw new LiveError("Unable to load join requests.", 503);
    const visible = (kind: string, team: string | null) =>
      admin || (kind === "parent" && !!team && coachTeams.includes(team));
    const pending = (requests.data ?? []).filter((r) => visible(r.kind, r.team_id));
    const users = await Promise.all([...new Set(pending.map((r) => r.user_id))].map(async (id) => {
      const { data, error } = await db.auth.admin.getUserById(id);
      if (error) throw new LiveError("Unable to load requester accounts.", 503);
      return { id, email: data.user.email };
    }));
    return reply({
      links: (links.data ?? []).filter((l) => visible(l.kind, l.team_id)),
      requests: pending, users,
    });
  } catch (e) { return failure(e); }
}

export async function POST(request: Request) {
  try {
    const s = await sessionFor(request, true);
    if (!s.userId) throw new LiveError("Sign in with your email.", 403);
    const b = await request.json();
    const db = accessDb();
    if (b.action === "create_link") {
      const token = randomBytes(32).toString("base64url");
      const result = await db.rpc("create_join_link", {
        p_actor: s.userId, p_org: s.orgId,
        p_team: typeof b.teamId === "string" ? b.teamId : null,
        p_kind: b.kind, p_token: token,
      });
      if (result.error) throw new LiveError(result.error.code === "P0001"
        ? result.error.message : "Unable to create join link.", 409);
      return reply({ ok: true, token });
    }
    if (b.action === "revoke_link") {
      if (typeof b.token !== "string") throw new LiveError("Choose a link.", 400);
      const result = await db.rpc("revoke_join_link", { p_actor: s.userId, p_token: b.token });
      if (result.error) throw new LiveError(result.error.code === "P0001"
        ? result.error.message : "Unable to turn off join link.", 409);
      return reply({ ok: true });
    }
    if (b.action === "approve" || b.action === "reject") {
      if (typeof b.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(b.requestId))
        throw new LiveError("Choose a request.", 400);
      const result = await db.rpc("review_join_request", {
        p_actor: s.userId, p_request: b.requestId, p_approve: b.action === "approve",
        p_player: typeof b.playerId === "string" ? b.playerId : null,
        p_team: typeof b.teamId === "string" ? b.teamId : null,
        p_role: typeof b.role === "string" ? b.role : null,
      });
      if (result.error) throw new LiveError(result.error.code === "P0001"
        ? result.error.message : "Unable to review request.", 409);
      return reply({ ok: true });
    }
    throw new LiveError("Choose a join action.", 400);
  } catch (e) { return failure(e); }
}
