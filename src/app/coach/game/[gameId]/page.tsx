import Link from "next/link";
import { readDb, toV2EventFallback } from "@/lib/coach/local-db";
import { team as brandTeam } from "@/lib/brand-config";

export default async function ReadOnlyGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const db = await readDb();
  const game = db.games.find((g) => g.clientGameId === gameId || g.id === gameId);

  if (!game) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-d-ink">
        <h1 className="text-2xl font-black">Game Not Found</h1>
        <p className="mt-2 text-d-ink-2">No game exists for id: {gameId}</p>
        <Link href="/coach" className="mt-4 inline-block rounded bg-d-sel px-4 py-2 text-sm font-semibold text-white">Back to Logger</Link>
      </main>
    );
  }

  const team = db.teams.find((t) => t.id === game.opponentTeamId);
  const events = db.playEvents
    .filter((e) => e.gameId === game.id)
    .sort((a, b) => b.eventIndex - a.eventIndex)
    .map((row) => toV2EventFallback(row));

  return (
    <main className="mx-auto max-w-4xl p-6 text-d-ink">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{game.label}</h1>
        <Link href="/coach" className="rounded border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel">Open Logger</Link>
      </div>
      <p className="text-sm text-d-ink-2">{new Date(game.playedAt).toLocaleString()} · {brandTeam.name} {game.usScore} - {game.opponentScore} {team?.name || "Opponents"}</p>

      <section className="mt-6 rounded-xl border border-d-line bg-d-surface p-4">
        <h2 className="mb-3 text-lg font-bold">Live Feed</h2>
        <ul className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="rounded border border-d-line bg-d-surface p-2">
              <div className="font-semibold">Inning {event.inning} · {event.batter} · {event.result.replaceAll("_", " ")}</div>
              <div className="text-d-ink-2">{event.description}</div>
              <div className="text-xs text-d-ink-3">Outs: {event.stateAfter.outs} · Score {event.stateAfter.usRuns}-{event.stateAfter.opponentRuns}</div>
            </li>
          ))}
          {events.length === 0 && <li className="text-d-ink-3">No events recorded.</li>}
        </ul>
      </section>
    </main>
  );
}
