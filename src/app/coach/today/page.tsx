"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import type { LiveGame } from "@/lib/coach/live/model";
export default function Today() {
  const { catalog, error, retry } = useCatalog();
  const [games, setGames] = useState<LiveGame[]>([]);
  const [gameError, setGameError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/live", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setGames(data.games);
        setLoaded(true);
        setGameError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setGameError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  const current =
    games.find((g) => g.status === "live") ??
    games.find((g) => g.status === "ready");
  return (
    <Workspace catalog={catalog} active="Today">
      <section className="nf-intro">
        <p className="nf-eyebrow">ONE TEAM. EVERYONE KNOWS THEIR JOB.</p>
        <h2>
          {current?.status === "live"
            ? "Your game is underway."
            : "Ready for the first pitch."}
        </h2>
        <p>
          Prepare together. Record from the sidelines. Keep the dugout in sync.
        </p>
      </section>
      {error && <LoadError error={error} retry={retry} />}
      {gameError && (
        <LoadError error={gameError} retry={() => setAttempt((x) => x + 1)} />
      )}
      <div className="nf-grid">
        <section className="nf-card">
          <p className="nf-eyebrow">
            {current?.status === "live" ? "LIVE GAME" : "NEXT GAME"}
          </p>
          {current ? (
            <>
              <h3>
                {current.config.teamName} <span className="nf-muted">vs</span>{" "}
                {current.config.opponent}
              </h3>
              <p>
                {current.config.date} ·{" "}
                {current.config.usAreHome ? "Home" : "Away"} ·{" "}
                {current.config.innings} innings
              </p>
              <Link className="nf-button" href={`/coach/live/${current.id}`}>
                {current.status === "live"
                  ? "Rejoin game"
                  : "Finish preparation"}{" "}
                →
              </Link>
            </>
          ) : (
            <>
              <h3>
                {loaded ? "Your next game starts here." : "Loading your games…"}
              </h3>
              <p>Choose a lineup and give each recorder a clear role.</p>
              {catalog?.role !== "viewer" && catalog && (
                <Link className="nf-button" href="/coach/live/new">
                  Prepare a game →
                </Link>
              )}
            </>
          )}
        </section>
        <section className="nf-card">
          <p className="nf-eyebrow">YOUR GAME-DAY CREW</p>
          <h3>A job for every device.</h3>
          <p>
            Use one phone for all scoring, or assign pitches and plays to
            different parents. Open the read-only dugout display on an iPad.
          </p>
          <p className="nf-muted">
            Recorder links are specific to a game. Everyone signs in to the same
            organization.
          </p>
          <Link href="/coach/team">Review your team →</Link>
        </section>
      </div>
      <Link className="nf-training-link" href="/coach/training">
        <strong>A little practice. A smarter player.</strong>
        <span>Open assigned practice and player progress →</span>
      </Link>
      <section id="games" className="nf-section">
        <h2>Shared games</h2>
        {current && catalog && catalog.role !== "viewer" && (
          <p>
            <Link className="nf-button nf-secondary" href="/coach/live/new">
              Prepare another game →
            </Link>
          </p>
        )}
        {loaded && !games.length && (
          <p className="nf-muted">
            No shared games yet. Your existing game history is still in{" "}
            <Link href="/coach/dashboard">Insights</Link>.
          </p>
        )}
        <div className="nf-game-list">
          {games.map((g) => (
            <Link
              className="nf-game-row"
              href={
                g.status === "final"
                  ? `/coach/live/${g.id}/insights`
                  : `/coach/live/${g.id}`
              }
              key={g.id}
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
              <span aria-hidden>
                {g.status === "final" ? "Review →" : "Open →"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </Workspace>
  );
}
