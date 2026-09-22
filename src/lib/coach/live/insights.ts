import type { Command, LiveGame, Snapshot, Side } from "./model.ts";
import { battingSide } from "./model.ts";
import { recommendPractice } from "../../practice/recommendations.ts";
export type Receipt = {
  id: string;
  revision: number;
  command: Command;
  before_state: Snapshot | null;
  after_state: Snapshot | null;
  created_at: string;
};
export function gameInsights(game: LiveGame, receipts: Receipt[]) {
  const undone = new Set(
    receipts
      .filter((r) => r.command.type === "undo")
      .map((r) => (r.command as Extract<Command, { type: "undo" }>).targetId),
  );
  const effective = receipts.filter(
    (r) => r.command.type !== "undo" && !undone.has(r.id),
  );
  const contacts: {
    side: Side;
    zone: string;
    result: string;
    batter: string;
    inning: number;
  }[] = [];
  const names: Record<string, string> = {};
  for (const [side, p] of Object.entries(game.pitchers))
    names[`${side}:${p.id}`] = p.name;
  for (const p of game.config.roster) names[`us:${p.id}`] = p.name;
  for (const row of effective) {
    if (row.command.type === "pitcher")
      names[`${row.command.side}:${row.command.pitcher.id}`] =
        row.command.pitcher.name;
    if (row.before_state) {
      for (const [side, p] of Object.entries(row.before_state.pitchers))
        names[`${side}:${p.id}`] = p.name;
    }
    if (row.command.type === "result" && row.before_state)
      contacts.push({
        side: battingSide(row.before_state),
        zone: row.command.zone,
        result: row.command.result,
        batter: row.before_state.pending?.batter.name ?? "Unknown batter",
        inning: row.before_state.inning,
      });
  }
  const zones = Object.entries(
    contacts
      .filter((c) => c.side === "them")
      .reduce<Record<string, number>>((a, c) => {
        a[c.zone] = (a[c.zone] ?? 0) + 1;
        return a;
      }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const base = {
    pitchers: Object.entries(game.pitchCounts).map(([id, count]) => ({
      id,
      name: names[id] ?? id.split(":").slice(1).join(":"),
      side: id.startsWith("us:") ? "us" : "them",
      count,
    })),
    contacts,
    zones,
    missingContext: effective.filter(
      (r) => r.command.type === "result" && !r.before_state,
    ).length,
    corrections:
      undone.size +
      effective.filter((r) => r.command.type === "correct").length,
    correctionNotes: effective
      .filter((r) => r.command.type === "correct")
      .map((r) => ({
        reason: (r.command as Extract<Command, { type: "correct" }>).reason,
        at: r.created_at,
      })),
  };
  return { ...base, practiceRecommendation: recommendPractice(base) };
}
