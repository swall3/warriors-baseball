"use client";

import { useState } from "react";
import Link from "next/link";
import type { PracticeRecommendation } from "@/lib/practice/recommendations";

export default function SuggestedPractice({
  recommendation,
  teamId,
  opponent,
  gameId,
}: {
  recommendation: PracticeRecommendation;
  teamId: string;
  opponent: string;
  gameId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [planId, setPlanId] = useState("");

  async function savePlan() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/coach/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          name: `Postgame focus: ${recommendation.positions.join(" / ")}`,
          description: `Suggested after the game vs ${opponent}. ${recommendation.reason}`,
          blocks: recommendation.blocks,
          sourceGameId: gameId,
          recommendationContext: {
            zone: recommendation.zone,
            positions: recommendation.positions,
            evidenceLabel: recommendation.evidenceLabel,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlanId(data.plan.id);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="nf-card nf-practice-recommendation">
      <p className="nf-eyebrow">{recommendation.evidenceLabel}</p>
      <h3>Suggested next practice: {recommendation.positions.join(" / ")}</h3>
      <p>{recommendation.reason}</p>
      <div className="nf-recommended-drills">
        {recommendation.drills.map((drill) => (
          <div key={drill.id}>
            <strong>{drill.name}</strong>
            <span>{drill.durationMinutes} min · {drill.category}</span>
          </div>
        ))}
      </div>
      {planId ? (
        <p role="status">Practice saved. <Link href={`/coach/practice/${planId}`}>Open and customize it →</Link></p>
      ) : (
        <button onClick={() => void savePlan()} disabled={busy}>{busy ? "Saving…" : "Save suggested practice"}</button>
      )}
      {error && <p className="nf-notice" role="alert">{error}</p>}
      <p className="nf-muted">This recommendation uses recorded contact and errors as a starting point. The coach makes the final call.</p>
    </section>
  );
}
