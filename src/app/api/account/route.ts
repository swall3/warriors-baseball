import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  IDENTITY_COOKIE,
  ORG_COOKIE,
  accessDb,
  verifiedIdentity,
} from "@/lib/access/identity";
import { authClient } from "@/lib/billing/server";
import { AUTH_COOKIE } from "@/lib/coach/auth";
import { SESSION_COOKIE } from "@/lib/coach/session";

const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function GET() {
  const jar = await cookies();
  const user = await verifiedIdentity(jar.get(IDENTITY_COOKIE)?.value);
  if (!user) return json({ user: null, organizations: [] });
  const db = accessDb();
  const members = await db
    .from("org_members")
    .select("org_id,role")
    .eq("user_id", user.id);
  if (members.error) return json({ error: "Unable to load memberships." }, 503);
  const orgs = await db
    .from("organizations")
    .select("id,name")
    .in(
      "id",
      members.data.map((m) => m.org_id),
    )
    .eq("active", true);
  if (orgs.error) return json({ error: "Unable to load organizations." }, 503);
  return json({
    user: { id: user.id, email: user.email },
    organizations: orgs.data,
    selected: jar.get(ORG_COOKIE)?.value,
  });
}
export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (
      origin.host !== (request.headers.get("host") ?? new URL(request.url).host)
    )
      return json({ error: "Open this action from InningWise." }, 403);
    const b = await request.json(),
      jar = await cookies(),
      db = accessDb();
    if (b.action === "signout") {
      const token = jar.get(IDENTITY_COOKIE)?.value;
      if (token) await db.auth.admin.signOut(token, "local");
      const response = json({ ok: true });
      response.cookies.set("iw_billing_identity", "", {
        ...options,
        path: "/api/coach/billing",
        maxAge: 0,
      });
      for (const name of [
        IDENTITY_COOKIE,
        ORG_COOKIE,
        AUTH_COOKIE,
        SESSION_COOKIE,
      ])
        response.cookies.set(name, "", { ...options, maxAge: 0 });
      response.cookies.set("iw_refresh", "", {
        ...options,
        path: "/api/account",
        maxAge: 0,
      });
      return response;
    }
    if (b.action === "refresh") {
      const refresh = jar.get("iw_refresh")?.value;
      if (!refresh) return json({ ok: false }, 401);
      const { data, error } = await authClient().auth.refreshSession({
        refresh_token: refresh,
      });
      if (
        error ||
        !data.session ||
        !data.user?.email_confirmed_at ||
        data.user.is_anonymous
      )
        return json({ ok: false }, 401);
      const response = json({ ok: true });
      response.cookies.set(IDENTITY_COOKIE, data.session.access_token, {
        ...options,
        maxAge: data.session.expires_in,
      });
      response.cookies.set("iw_refresh", data.session.refresh_token, {
        ...options,
        path: "/api/account",
        maxAge: 30 * 86400,
      });
      return response;
    }
    if (b.action === "send" || b.action === "verify") {
      const email =
        typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return json({ error: "Enter your email." }, 400);
      const auth = authClient();
      if (b.action === "send") {
        // Only a valid, email-bound invitation permits creating an account.
        let invited = false;
        if (typeof b.invite === "string" && b.invite.length <= 100) {
          const i = await db
            .from("access_invitations")
            .select("id")
            .eq("token_hash", hash(b.invite))
            .eq("email", email)
            .is("accepted_at", null)
            .is("revoked_at", null)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          invited = !i.error && !!i.data;
        }
        const { error } = await auth.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: invited },
        });
        if (error?.status === 429)
          return json(
            { error: "Please wait before requesting another code." },
            429,
          );
        if (error && (!error.status || error.status >= 500))
          return json(
            { error: "Email sign-in is unavailable. Try again shortly." },
            503,
          );
        return json({
          ok: true,
          message:
            "If your email has an account or a valid invitation, a code is on its way.",
        });
      }
      if (typeof b.token !== "string" || !/^\d{6,10}$/.test(b.token))
        return json({ error: "Enter the code from your email." }, 400);
      const { data, error } = await auth.auth.verifyOtp({
        email,
        token: b.token,
        type: "email",
      });
      if (
        error ||
        !data.session ||
        !data.user?.email_confirmed_at ||
        data.user.is_anonymous
      )
        return json({ error: "Code invalid or expired." }, 401);
      const response = json({ ok: true });
      response.cookies.set(IDENTITY_COOKIE, data.session.access_token, {
        ...options,
        maxAge: data.session.expires_in,
      });
      response.cookies.set("iw_refresh", data.session.refresh_token, {
        ...options,
        path: "/api/account",
        maxAge: 30 * 86400,
      });
      // Retire browser-wide shared cookies when adopting a named account.
      for (const name of [AUTH_COOKIE, SESSION_COOKIE])
        response.cookies.set(name, "", { ...options, maxAge: 0 });
      return response;
    }
    const user = await verifiedIdentity(jar.get(IDENTITY_COOKIE)?.value);
    if (!user) return json({ error: "Sign in with your email first." }, 401);
    let orgId = b.orgId;
    if (b.action === "accept") {
      if (typeof b.invite !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(b.invite))
        return json({ error: "Invitation link invalid." }, 400);
      const accepted = await db.rpc("accept_team_invitation", {
        p_actor: user.id,
        p_hash: hash(b.invite),
      });
      if (accepted.error)
        return json(
          {
            error:
              "This invitation is expired, revoked, already used, or belongs to a different email. Ask your coach for a new invitation.",
          },
          409,
        );
      orgId = accepted.data;
    } else if (b.action !== "select")
      return json({ error: "Unknown action." }, 400);
    const member = await db
      .from("org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (member.error || !member.data)
      return json({ error: "Organization access unavailable." }, 403);
    const response = json({ ok: true });
    response.cookies.set(ORG_COOKIE, orgId, { ...options, maxAge: 30 * 86400 });
    return response;
  } catch {
    return json(
      { error: "Unable to complete account action. Please retry." },
      400,
    );
  }
}
