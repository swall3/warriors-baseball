"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import type { ReportGame } from "@/lib/coach/reports";
export default function Insights() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const [games, setGames] = useState<ReportGame[]>([]);
  const [error, setError] = useState("");
  const [loading,setLoading]=useState(true);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/coach/reports", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setGames(d.games);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return () => controller.abort();
  }, [version]);
  return (
    <Workspace catalog={catalog} active="Insights">
      <section className="nf-intro">
        <p className="nf-eyebrow">FROM GAME DAY TO THE NEXT PRACTICE</p>
        <h2>Review. Learn. Play again.</h2>
        <p>
          Shared games and historical imports are together here. Open a game for
          its details, or compare contact patterns across games.
        </p>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}{" "}
      {error && (
        <LoadError error={error} retry={() => setVersion((v) => v + 1)} />
      )}
      <div className="nf-game-list">
        {games.map((g) => (
          <Link className="nf-game-row" key={g.id} href={g.href}>
            <span className={`nf-status nf-${g.status}`}>
              {g.source === "shared" ? g.status : "imported"}
            </span>
            <span>
              <strong>{g.label}</strong>
              <small>{g.date.slice(0, 10)}{g.missingContext ? ` · ${g.missingContext} older plays lack contact context` : ""}</small>
            </span>
            <b>
              {g.score.us} – {g.score.opponents}
            </b>
            <span>→</span>
          </Link>
        ))}
      </div>
      {loading && <p role="status">Loading game reviews…</p>}
      {!loading && !error && !games.length && (
        <p className="nf-card">No saved games available yet.</p>
      )}
      <section className="nf-card nf-section">
        <h3>Team analytics</h3>
        <p>
          Compare shared and imported contact patterns, spray charts and
          opponent tendencies in the same workspace.
        </p>
        <Link className="nf-button" href="/coach/dashboard">
          Open team analytics →
        </Link>
        <details className="nf-section">
          <summary>Recover an older device-only game</summary>
          <p>
            These tools read games previously saved on this device. Use Prepare
            for all new shared games.
          </p>
          <Link href="/coach/legacy">Open legacy scorer</Link> ·{" "}
          <Link href="/coach/legacy/lineup">Open legacy rotation plan</Link>
        </details>
      </section>
    </Workspace>
  );
}
