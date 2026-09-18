import Link from "next/link";
import { readDb, toV2EventFallback } from "@/lib/coach/local-db";

export default async function ReadOnlyGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const db = await readDb();
  const game = db.games.find((g) => g.clientGameId === gameId || g.id === gameId);

  if (!game) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-slate-100">
        <h1 className="text-2xl font-black">Game Not Found</h1>
        <p className="mt-2 text-slate-300">No game exists for id: {gameId}</p>
        <Link href="/coach" className="mt-4 inline-block rounded bg-cyan-700 px-4 py-2 text-sm font-semibold text-white">Back to Logger</Link>
      </main>
    );
  }

  const team = db.teams.find((t) => t.id === game.opponentTeamId);
  const events = db.playEvents
    .filter((e) => e.gameId === game.id)
    .sort((a, b) => b.eventIndex - a.eventIndex)
    .map((row) => toV2EventFallback(row));

  return (
    <main className="mx-auto max-w-4xl p-6 text-slate-100">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black">{game.label}</h1>
        <Link href="/coach" className="rounded border border-cyan-300/40 bg-cyan-500/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100">Open Logger</Link>
      </div>
      <p className="text-sm text-slate-300">{new Date(game.playedAt).toLocaleString()} · Outlaws {game.outlawsScore} - {game.opponentScore} {team?.name || "Opponents"}</p>

      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
        <h2 className="mb-3 text-lg font-bold">Live Feed</h2>
        <ul className="space-y-2 text-sm">
          {events.map((event) => (
            <li key={event.id} className="rounded border border-slate-700 bg-slate-900/60 p-2">
              <div className="font-semibold">Inning {event.inning} · {event.batter} · {event.result.replaceAll("_", " ")}</div>
              <div className="text-slate-300">{event.description}</div>
              <div className="text-xs text-slate-400">Outs: {event.stateAfter.outs} · Score {event.stateAfter.outlawsRuns}-{event.stateAfter.opponentRuns}</div>
            </li>
          ))}
          {events.length === 0 && <li className="text-slate-400">No events recorded.</li>}
        </ul>
      </section>
    </main>
  );
}
