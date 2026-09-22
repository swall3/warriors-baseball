import { readDb } from "./local-db";
import { client, LiveError } from "./live/store";
import type { LiveGame } from "./live/model";
import type { Receipt } from "./live/insights";
import { historicalReports, sharedReport } from "./reports";
export async function readReports(orgId: string) {
  const db = client();
  const historical = await readDb({ orgId });
  const games: LiveGame[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db
      .from("live_games")
      .select("state")
      .eq("org_id", orgId)
      .order("id")
      .range(offset, offset + 99)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error)
      throw new LiveError("Game reports are unavailable. Please retry.", 503);
    games.push(...(data ?? []).map((r) => r.state as LiveGame));
    if ((data ?? []).length < 100) break;
  }
  const receipts = new Map<string, Receipt[]>();
  // Read in bounded batches instead of one query per game. A revision cutoff
  // below makes each report consistent with its captured game snapshot.
  for (let start = 0; start < games.length; start += 50) {
    const ids = games.slice(start, start + 50).map((g) => g.id);
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("live_game_commands")
        .select(
          "game_id,id,revision,command,before_state,after_state,created_at",
        )
        .eq("org_id", orgId)
        .in("game_id", ids)
        .order("game_id")
        .order("revision")
        .range(offset, offset + 499)
        .abortSignal(AbortSignal.timeout(10_000));
      if (error)
        throw new LiveError("Game reports are unavailable. Please retry.", 503);
      for (const row of data ?? []) {
        const group = receipts.get(row.game_id) ?? [];
        group.push(row as Receipt);
        receipts.set(row.game_id, group);
      }
      if ((data ?? []).length < 500) break;
    }
  }
  return [
    ...historicalReports(historical),
    ...games.map((g) =>
      sharedReport(
        g,
        (receipts.get(g.id) ?? []).filter((r) => r.revision <= g.revision),
      ),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
