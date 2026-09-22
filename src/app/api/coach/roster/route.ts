import { randomUUID } from "node:crypto";
import { client, LiveError } from "@/lib/coach/live/store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";

function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new LiveError(`${label} must be 1–${max} characters.`, 400);
  return value.trim();
}
function check(error: { code?: string; message: string } | null) {
  if (error)
    throw new LiveError(
      error.code === "23505"
        ? "That jersey number is already assigned on this team (including inactive players)."
        : "Unable to save the roster. Please retry.",
      error.code === "23505" ? 409 : 503,
    );
}
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const teamId = text(
      new URL(request.url).searchParams.get("teamId"),
      "Team",
      120,
    );
    const { data, error } = await client()
      .from("players")
      .select("id,team_id,display_name,jersey_number,active")
      .eq("org_id", session.orgId)
      .eq("team_id", teamId)
      .order("display_name");
    check(error);
    return reply({ players: data ?? [] });
  } catch (e) {
    return failure(e);
  }
}
async function save(request: Request, create: boolean) {
  try {
    const session = await sessionFor(request, true);
    if (session.role === "viewer")
      throw new LiveError("Only coaches can edit the team.", 403);
    const body = await request.json();
    const teamId = text(body.teamId, "Team", 120);
    const db = client();
    const team = await db
      .from("teams")
      .select("id")
      .eq("org_id", session.orgId)
      .eq("id", teamId)
      .maybeSingle();
    check(team.error);
    if (!team.data) throw new LiveError("Team not found.", 404);
    if (!create && body.kind === "team") {
      const result = await db
        .from("teams")
        .update({ name: text(body.name, "Team name", 80) })
        .eq("org_id", session.orgId)
        .eq("id", teamId)
        .select("id,name")
        .single();
      check(result.error);
      return reply({ team: result.data });
    }
    if (body.kind !== "player")
      throw new LiveError("Choose a team or player edit.", 400);
    const display_name = text(body.name, "Player name", 80);
    if (body.jersey !== undefined && typeof body.jersey !== "string")
      throw new LiveError("Enter a jersey number.", 400);
    const jersey_number = (body.jersey ?? "").trim() || null;
    if (jersey_number && jersey_number.length > 8)
      throw new LiveError("Jersey numbers must be 8 characters or fewer.", 400);
    if (!create && typeof body.active !== "boolean")
      throw new LiveError("Choose an active status.", 400);
    const values = {
      display_name,
      jersey_number,
      active: create ? true : body.active,
    };
    const result = create
      ? await db
          .from("players")
          .insert({
            ...values,
            id: `plr-${randomUUID()}`,
            team_id: teamId,
            org_id: session.orgId,
          })
          .select("id")
          .single()
      : await db
          .from("players")
          .update(values)
          .eq("org_id", session.orgId)
          .eq("team_id", teamId)
          .eq("id", text(body.playerId, "Player", 120))
          .select("id")
          .maybeSingle();
    check(result.error);
    if (!result.data) throw new LiveError("Player not found.", 404);
    return reply({ ok: true }, create ? 201 : 200);
  } catch (e) {
    return failure(e);
  }
}
export const POST = (request: Request) => save(request, true);
export const PATCH = (request: Request) => save(request, false);
