import { client, LiveError } from "@/lib/coach/live/store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
import { outingFromGame } from "@/lib/coach/live/pitch-rules";
import type { LiveGame } from "@/lib/coach/live/model";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const q = new URL(request.url).searchParams;
    const date = q.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
      throw new LiveError("Choose a valid date", 400);
    const since = new Date(Date.parse(date) - 15 * 86400000)
      .toISOString()
      .slice(0, 10);
    const outings = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client()
        .from("live_games")
        .select("id,state")
        .eq("org_id", session.orgId)
        .gte("state->config->>date", since)
        .lte("state->config->>date", date)
        .order("id")
        .range(offset, offset + 499);
      if (error)
        throw new LiveError(
          "Pitch history unavailable. Confirm workload with the coach.",
          503,
        );
      for (const row of data ?? [])
        if (
          row.id !== q.get("exclude") &&
          row.state.config.format === "kid_pitch"
        )
          outings.push(outingFromGame(row.state as LiveGame));
      if ((data ?? []).length < 500) break;
    }
    return reply({ outings });
  } catch (e) {
    return failure(e);
  }
}
