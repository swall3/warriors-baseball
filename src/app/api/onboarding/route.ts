import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessDb, IDENTITY_COOKIE, verifiedIdentity } from "@/lib/access/identity";
import { activeJoinLink, validJoinToken } from "@/lib/access/join";

const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store, private" },
});

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const link = token ? await activeJoinLink(token) : null;
  if (token && !link) return json({ error: "This join link has expired. Ask your coach for a new one." }, 404);
  const user = await verifiedIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
  if (!user) return json({ link, requests: [] });
  const db = accessDb();
  const r = await db.from("join_requests")
    .select("id,org_id,team_id,kind,child_name,status,created_at")
    .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30);
  if (r.error) return json({ error: "Unable to load join requests." }, 503);
  return json({ link, requests: r.data ?? [] });
}

export async function POST(request: Request) {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    if (origin.host !== (request.headers.get("host") ?? new URL(request.url).host))
      return json({ error: "Open this action from InningWise." }, 403);
    const user = await verifiedIdentity((await cookies()).get(IDENTITY_COOKIE)?.value);
    if (!user) return json({ error: "Verify your email first." }, 401);
    const b = await request.json();
    if (b.action !== "request" || !validJoinToken(b.token))
      return json({ error: "Choose a valid join link." }, 400);
    const childName = typeof b.childName === "string" ? b.childName.trim() : null;
    const note = typeof b.note === "string" ? b.note.trim() : null;
    if ((childName && childName.length > 80) || (note && note.length > 300))
      return json({ error: "Please shorten your request." }, 400);
    const result = await accessDb().rpc("request_join", {
      p_actor: user.id, p_token: b.token, p_child_name: childName, p_note: note,
    });
    if (result.error) return json({
      error: result.error.code === "23505"
        ? "You already have a pending request for this child or organization."
        : result.error.code === "P0001" ? result.error.message : "Unable to request access. Please retry.",
    }, 409);
    return json({ ok: true, requestId: result.data });
  } catch {
    return json({ error: "Unable to submit request. Please retry." }, 400);
  }
}
