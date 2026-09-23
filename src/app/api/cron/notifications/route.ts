import { deliverDueNotifications } from "@/lib/notifications/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await deliverDueNotifications(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("[notifications] scheduled delivery unavailable");
    return Response.json({ error: "Delivery unavailable" }, { status: 503 });
  }
}
