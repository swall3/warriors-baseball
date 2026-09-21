import { NextRequest } from 'next/server';
import { readDb, toV2EventFallback } from '@/lib/coach/local-db';
import { requireCoach } from '@/lib/coach/auth';

export async function GET(request: NextRequest) {
  if (!(await requireCoach())) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get('id');
    const team = searchParams.get('team') || 'us';

    if (!gameId) {
      return Response.json({ ok: false, error: 'Game ID is required' }, { status: 400 });
    }

    const db = await readDb();
    const game = db.games.find(g => g.clientGameId === gameId || g.id === gameId);

    if (!game) {
      return Response.json({ ok: false, error: 'Game not found' }, { status: 404 });
    }

    const playEvents = db.playEvents
      .filter(e => e.gameId === game.id)
      .sort((a, b) => a.eventIndex - b.eventIndex)
      .map(e => toV2EventFallback(e))
      .filter(e => team === 'all' || e.battingTeam === team);

    return Response.json({ ok: true, events: playEvents });
  } catch (error) {
    console.error('Error in play-events endpoint:', error);
    return Response.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
