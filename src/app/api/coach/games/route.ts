import { NextResponse } from "next/server";
import { readDb } from "@/lib/coach/local-db";
import { requireCoach } from "@/lib/coach/auth";

export async function GET() {
  const session = await requireCoach();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  try {
    const db = await readDb({ orgId: session.orgId });
    const teams = new Map(db.teams.map((t) => [t.id, t]));
    const contacts = new Map<string, typeof db.playEvents>();
    for (const event of db.playEvents) {
      if (event.eventType !== "ball_in_play") continue;
      const rows = contacts.get(event.gameId) ?? [];
      rows.push(event);
      contacts.set(event.gameId, rows);
    }
    const games = db.games.map((g) => {
      const team = teams.get(g.opponentTeamId);
      const pins = (contacts.get(g.id) ?? [])
        .sort((a, b) => a.eventIndex - b.eventIndex)
        .map((event) => ({
          id: event.clientPinId || event.id,
          batter: event.batter,
          result: event.result,
          zone: event.zone,
          x: event.x,
          y: event.y,
          inning: event.inning,
          battingTeam: event.battingTeam,
          description: event.description,
        }));
      return {
        id: g.clientGameId,
        label: g.label,
        date: g.playedAt,
        opponentTeamName: team?.name || "Opponents",
        score: { us: g.usScore, opponents: g.opponentScore },
        usAreHome: g.usAreHome ?? false,
        pinCount: pins.length,
        pins,
      };
    });
    return NextResponse.json(
      { ok: true, games },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  } catch (error) {
    console.error("[historical-games] read failed", error);
    return NextResponse.json(
      { ok: false, error: "Historical games are unavailable. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store, private" } },
    );
  }
}
