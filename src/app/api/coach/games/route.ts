import { NextResponse } from "next/server";
import { readDb } from "@/lib/coach/local-db";
import { requireCoach } from "@/lib/coach/auth";

export async function GET() {
  if (!(await requireCoach())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = await readDb();
    const games = db.games.map((g) => {
      const team = db.teams.find((t) => t.id === g.opponentTeamId);
      const pins = db.playEvents
        .filter((e) => e.gameId === g.id)
        .filter((e) => e.eventType === "ball_in_play")
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
        score: { outlaws: g.outlawsScore, opponents: g.opponentScore },
        outlawsAreHome: g.outlawsAreHome ?? false,
        pinCount: pins.length,
        pins,
      };
    });
    return NextResponse.json({ ok: true, games });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load games";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
