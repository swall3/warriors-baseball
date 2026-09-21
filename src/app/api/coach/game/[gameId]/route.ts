import { NextResponse } from "next/server";
import { readDb, toV2EventFallback } from "@/lib/coach/local-db";
import { requireCoach } from "@/lib/coach/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const session = await requireCoach();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { gameId } = await params;
    const db = await readDb({ orgId: session.orgId });
    const game = db.games.find((g) => g.clientGameId === gameId || g.id === gameId);
    if (!game) return NextResponse.json({ ok: false, error: "Game not found" }, { status: 404 });

    const team = db.teams.find((t) => t.id === game.opponentTeamId);
    const events = db.playEvents
      .filter((e) => e.gameId === game.id)
      .sort((a, b) => a.eventIndex - b.eventIndex)
      .map((row) => toV2EventFallback(row));

    return NextResponse.json({
      ok: true,
      game: {
        id: game.clientGameId,
        label: game.label,
        playedAt: game.playedAt,
        score: { us: game.usScore, opponents: game.opponentScore },
        opponentTeamName: team?.name || "Opponents",
        usAreHome: game.usAreHome ?? false,
        schemaVersion: game.schemaVersion ?? 1,
        eventsV2: events,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load game";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
