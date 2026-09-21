"use client";
import { useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import type { Player } from "@/lib/coach/live/model";
export default function PracticeAssignment({
  players,
  gameId,
  zone,
  onAssigned,
}: {
  players: Player[];
  gameId?: string;
  zone?: string;
  onAssigned?: () => void;
}) {
  const [player, setPlayer] = useState(players[0]?.id ?? "");
  const [scenario, setScenario] = useState(
    BACKUP_SCENARIOS.find((s) => s.ballZone === zone)?.id ?? "b1",
  );
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function assign() {
    setBusy(true);
    setSaved(false);
    try {
      const r = await fetch("/api/coach/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: player,
          scenarioId: scenario,
          gameId,
          note,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(
        "Practice assigned. It will be available on any signed-in device.",
      );
      setSaved(true);
      onAssigned?.();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nf-card">
      <p className="nf-eyebrow">TAKE IT TO PRACTICE</p>
      <h3>Choose one useful rep.</h3>
      <div className="nf-form-grid">
        <label className="nf-label">
          Player
          <select value={player} onChange={(e) => setPlayer(e.target.value)}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="nf-label">
          Practice activity
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {BACKUP_SCENARIOS.map((s) => (
              <option value={s.id} key={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="nf-label nf-section">
        Coach note (optional)
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="One thing to focus on"
        />
      </label>
      <p className="nf-muted">
        These existing activities use a nine-position field. Discuss your team’s
        assignments and field format with the player.
      </p>
      <button onClick={assign} disabled={busy || !player}>
        {busy ? "Saving…" : "Assign practice"}
      </button>
      {message && (
        <p role="status">
          {message}{" "}
          {saved && (
            <Link href={`/coach/training?player=${encodeURIComponent(player)}`}>
              Open player practice →
            </Link>
          )}
        </p>
      )}
    </section>
  );
}
