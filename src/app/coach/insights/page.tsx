"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import type { LiveGame } from "@/lib/coach/live/model";
export default function Insights() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const [games, setGames] = useState<LiveGame[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/live", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setGames(d.games);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [version]);
  return (
    <Workspace catalog={catalog} active="Insights">
      <section className="nf-intro">
        <p className="nf-eyebrow">FROM GAME DAY TO THE NEXT PRACTICE</p>
        <h2>Review. Learn. Play again.</h2>
        <p>
          Open a shared game to review recorded contact, pitcher workloads and
          practice assignments.
        </p>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}{" "}
      {error && (
        <LoadError error={error} retry={() => setVersion((v) => v + 1)} />
      )}
      <div className="nf-game-list">
        {games.map((g) => (
          <Link
            className="nf-game-row"
            key={g.id}
            href={`/coach/live/${g.id}/insights`}
          >
            <span className={`nf-status nf-${g.status}`}>{g.status}</span>
            <span>
              <strong>
                {g.config.teamName} vs {g.config.opponent}
              </strong>
              <small>{g.config.date}</small>
            </span>
            <b>
              {g.score.us} – {g.score.them}
            </b>
            <span>→</span>
          </Link>
        ))}
      </div>
      {!error && !games.length && (
        <p className="nf-card">No shared games available yet.</p>
      )}
      <section className="nf-card nf-section">
        <h3>Historical team analytics</h3>
        <p>
          Previously imported games, spray charts and team statistics remain in
          the existing analytics workspace.
        </p>
        <Link className="nf-button" href="/coach/dashboard">
          Open historical analytics →
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
