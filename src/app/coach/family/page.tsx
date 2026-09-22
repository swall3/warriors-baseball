"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
type Data = {
  games: { id: string; date: string; opponent: string; status: string }[];
  practice: {
    id: string;
    player_id: string;
    scenario_id: string;
    note: string;
  }[];
  players: { id: string; display_name: string }[];
};
export default function Family() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Record<string, string>>({});
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/coach/family", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, []);
  async function answer(id: string, position: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/coach/training/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), answer: position }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult((x) => ({ ...x, [id]: d.explanation }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="nf-workspace">
      <main className="nf-main">
        <header className="nf-top">
          <Link href="/">InningWise</Link>
          <Link href="/account">My account</Link>
        </header>
        <section className="nf-card">
          <p className="nf-eyebrow">FAMILY VIEW</p>
          <h1>Your team & your players</h1>
          <p>Game updates and coach-assigned practice, in one place.</p>
          {error && (
            <p role="alert" className="nf-notice">
              {error}
            </p>
          )}
          <h2>Games</h2>
          {data?.games.map((g) => (
            <article className="iw-member" key={g.id}>
              <strong>vs {g.opponent}</strong>
              <p>
                {g.date} · {g.status}
              </p>
            </article>
          ))}
          {data && !data.games.length && <p>No shared games yet.</p>}
          <h2>Assigned practice</h2>
          {data?.practice.map((a) => {
            const scenario = BACKUP_SCENARIOS.find(
              (s) => s.id === a.scenario_id,
            );
            return (
              <article className="nf-card nf-section" key={a.id}>
                <h3>
                  {data.players.find((p) => p.id === a.player_id)?.display_name}
                </h3>
                <p>{a.note}</p>
                <p>{scenario?.label}</p>
                <p>{scenario?.question}</p>
                <div className="iw-position-answers">
                  {["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].map(
                    (p) => (
                      <button
                        key={p}
                        disabled={busy}
                        onClick={() => answer(a.id, p)}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
                {result[a.id] && <p role="status">{result[a.id]}</p>}
              </article>
            );
          })}
          {data && !data.practice.length && (
            <p>
              Your coach’s assignments will appear here once your player is
              linked.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
