"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "./Workspace";
import PracticeAssignment from "./PracticeAssignment";
import type { LiveGame } from "@/lib/coach/live/model";
import type { gameInsights } from "@/lib/coach/live/insights";
export default function GameInsightsScreen({ gameId }: { gameId: string }) {
  const { catalog, error: catalogError, retry } = useCatalog();
  const [result, setResult] = useState<{
    game: LiveGame;
    insights: ReturnType<typeof gameInsights>;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coach/live/${encodeURIComponent(gameId)}/insights`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setResult(d);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [gameId, attempt]);
  return (
    <Workspace catalog={catalog} active="Insights">
      <section className="nf-intro">
        <p className="nf-eyebrow">GAME REVIEW</p>
        <h2>
          {result
            ? `${result.game.config.teamName} vs ${result.game.config.opponent}`
            : "Loading game review…"}
        </h2>
        <Link href={`/coach/live/${gameId}`}>← Back to game</Link>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}{" "}
      {error && (
        <LoadError error={error} retry={() => setAttempt((x) => x + 1)} />
      )}{" "}
      {result && (
        <>
          {result.game.status !== "final" && (
            <p className="nf-notice">
              This game is still {result.game.status}. These totals are a
              snapshot; finalize the game before treating them as complete.
            </p>
          )}
          <div className="nf-review-score">
            <strong>
              {result.game.score.us} – {result.game.score.them}
            </strong>
            <span>
              {result.game.config.date} · {result.game.status} ·{" "}
              {result.insights.corrections} corrections
            </span>
          </div>
          {result.insights.correctionNotes?.length > 0 && (
            <section className="nf-card">
              <h3>Coach corrections</h3>
              <ul>
                {result.insights.correctionNotes.map((note, i) => (
                  <li key={i}>
                    {note.reason} · {new Date(note.at).toLocaleString()}
                  </li>
                ))}
              </ul>
              <p>
                These notes explain adjustments to counts, runners and scores.
                Historical contact rulings remain as recorded.
              </p>
            </section>
          )}
          <div className="nf-grid">
            <section className="nf-card">
              <h3>Every pitcher’s workload</h3>
              {!result.insights.pitchers.length ? (
                <p>No pitches recorded.</p>
              ) : (
                <table className="nf-table">
                  <thead>
                    <tr>
                      <th>Pitcher</th>
                      <th>Team</th>
                      <th>Pitches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.insights.pitchers.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>
                          {p.side === "us"
                            ? result.game.config.teamName
                            : result.game.config.opponent}
                        </td>
                        <td>{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="nf-muted">
                Counts include recorded balls, strikes, fouls and balls in play.
                Compare with your league’s pitch and rest rules.
              </p>
            </section>
            <section className="nf-card">
              <h3>Where the defense was involved</h3>
              {result.insights.zones.length ? (
                <>
                  <p>
                    Most recorded opponent contact went to{" "}
                    <b>{result.insights.zones[0][0]}</b> (
                    {result.insights.zones[0][1]} plays).
                  </p>
                  <div className="nf-zone-bars">
                    {result.insights.zones.map(([zone, count]) => (
                      <div key={zone}>
                        <b>{zone}</b>
                        <meter
                          min={0}
                          max={Math.max(1, result.insights.zones[0][1])}
                          value={count}
                        />
                        <span>{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p>No opponent ball-in-play locations are available yet.</p>
              )}
              <p className="nf-muted">
                Location counts describe opportunities, not defensive quality.
                Use your observations to choose a practice focus.
              </p>
              {result.insights.missingContext > 0 && (
                <p className="nf-notice">
                  {result.insights.missingContext} older play records lack
                  team/batter context and are excluded from this location
                  summary. Pitch totals remain available.
                </p>
              )}
            </section>
          </div>
          {catalog && catalog.role !== "viewer" && (
            <div className="nf-section">
              <PracticeAssignment
                players={result.game.config.roster}
                gameId={gameId}
                zone={result.insights.zones[0]?.[0]}
              />
            </div>
          )}
          <section className="nf-card nf-section">
            <h3>Recorded contact</h3>
            <div className="nf-table-scroll">
              <table className="nf-table">
                <thead>
                  <tr>
                    <th>Inning</th>
                    <th>Batter</th>
                    <th>Team</th>
                    <th>Location</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {result.insights.contacts.map((p, i) => (
                    <tr key={i}>
                      <td>{p.inning}</td>
                      <td>{p.batter}</td>
                      <td>
                        {p.side === "us"
                          ? result.game.config.teamName
                          : result.game.config.opponent}
                      </td>
                      <td>{p.zone}</td>
                      <td>{p.result.replaceAll("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nf-muted">
              Undone plays are excluded. Imported historical games remain
              available in{" "}
              <Link href="/coach/dashboard">existing team analytics</Link>.
            </p>
          </section>
        </>
      )}
    </Workspace>
  );
}
