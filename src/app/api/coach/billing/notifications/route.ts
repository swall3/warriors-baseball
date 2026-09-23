import { teamScope } from "@/lib/billing/server";
import { failure, reply } from "@/lib/coach/live/http";
import { LiveError } from "@/lib/coach/live/store";
import {
  preferences,
  savePreferences,
  recentNotifications,
  queueTest,
  deliverPending,
  emailConfigured,
} from "@/lib/notifications/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const { session, team, user } = await teamScope(
      request,
      new URL(request.url).searchParams.get("team"),
      false,
      true,
    );
    return reply({
      preferences: await preferences(session.orgId, team.id, user!.id),
      ...await recentNotifications(session.orgId, team.id, user!.id),
      configured: emailConfigured(),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session, team, user } = await teamScope(
      request,
      body.team,
      true,
      true,
    );
    if (body.action === "save")
      await savePreferences(session.orgId, team.id, user!.id, body.preferences);
    else if (body.action === "test") {
      await queueTest(session.orgId, team.id, user!.id);
      await deliverPending(session.orgId, team.id);
    } else if (body.action === "retry")
      await deliverPending(session.orgId, team.id);
    else throw new LiveError("Choose an email action.", 400);
    return reply({
      ok: true,
      preferences: await preferences(session.orgId, team.id, user!.id),
      ...await recentNotifications(session.orgId, team.id, user!.id),
      configured: emailConfigured(),
    });
  } catch (e) {
    return failure(e);
  }
}
