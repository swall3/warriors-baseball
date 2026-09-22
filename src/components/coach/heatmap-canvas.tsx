"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlayEvent } from "@/lib/coach/types";
import { fieldPoints } from "@/lib/coach/field-geometry";
import {
  contactDensity,
  densityColor,
  selectContacts,
  type TeamFilter,
  type ContactFilter,
} from "@/lib/coach/contact-density";
import { useCoachBrand } from "@/lib/coach/org-client";
interface Props {
  gameId?: string;
  events?: PlayEvent[];
  visualStyle?: "classic" | "mesh";
}
const W = 648,
  H = 432,
  DW = 324,
  DH = 216;
const EMPTY: PlayEvent[] = [];
export default function HeatmapCanvas({ gameId, events: provided }: Props) {
  const brand = useCoachBrand();
  const [loaded, setLoaded] = useState<{
    id: string;
    events: PlayEvent[];
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [team, setTeam] = useState<TeamFilter>("all");
  const [outcome, setOutcome] = useState<ContactFilter>("all");
  const [spread, setSpread] = useState(28);
  const [showPoints, setShowPoints] = useState(false);
  const [selected, setSelected] = useState<PlayEvent | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const events = provided ?? (loaded && loaded.id === gameId ? loaded.events : EMPTY);
  const visible = useMemo(
    () => selectContacts(events, team, outcome),
    [events, team, outcome],
  );
  const loading =
    provided === undefined && !!gameId && loaded?.id !== gameId && !error;
  useEffect(() => {
    setSelected(null);
  }, [visible]);
  useEffect(() => {
    setError("");
    if (provided !== undefined || !gameId) return;
    const controller = new AbortController();
    fetch(`/api/coach/play-events?id=${encodeURIComponent(gameId)}&team=all`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok || !data.ok)
          throw new Error(data.error ?? "Unable to load contact.");
        setLoaded({ id: gameId, events: data.events ?? [] });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [gameId, provided, attempt]);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const P = fieldPoints(W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#e9efee";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#dce7df";
    ctx.beginPath();
    ctx.moveTo(...P.home);
    ctx.lineTo(...P.leftFoul);
    ctx.lineTo(0, 0);
    ctx.lineTo(W, 0);
    ctx.lineTo(...P.rightFoul);
    ctx.closePath();
    ctx.fill();
    const density = contactDensity(visible, DW, DH, spread / 2);
    const pixels = new ImageData(DW, DH);
    for (let i = 0; i < density.length; i++) {
      const v = density[i];
      if (v < 0.025) continue;
      const t = Math.pow(v, 0.7),
        color = densityColor(t),
        j = i * 4;
      pixels.data[j] = color[0];
      pixels.data[j + 1] = color[1];
      pixels.data[j + 2] = color[2];
      pixels.data[j + 3] = Math.round(220 * Math.min(1, (v - 0.025) / 0.12));
      // Subtle intensity contours make adjoining coverage regions readable.
      if (
        i % DW &&
        i >= DW &&
        (Math.floor(t * 7) !== Math.floor(Math.pow(density[i - 1], 0.7) * 7) ||
          Math.floor(t * 7) !== Math.floor(Math.pow(density[i - DW], 0.7) * 7))
      ) {
        for (let c = 0; c < 3; c++)
          pixels.data[j + c] = Math.round(pixels.data[j + c] * 0.83);
      }
    }
    const layer = document.createElement("canvas");
    layer.width = DW;
    layer.height = DH;
    layer.getContext("2d")!.putImageData(pixels, 0, 0);
    ctx.drawImage(layer, 0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(...P.leftFoul);
    ctx.lineTo(...P.home);
    ctx.lineTo(...P.rightFoul);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(...P.home);
    ctx.lineTo(...P.first);
    ctx.lineTo(...P.second);
    ctx.lineTo(...P.third);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(40,65,61,.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(P.home[0], P.home[1], H * 0.9, Math.PI * 1.25, Math.PI * 1.75);
    ctx.stroke();
    for (const point of [P.home, P.first, P.second, P.third]) {
      ctx.fillStyle = "white";
      ctx.fillRect(point[0] - 3, point[1] - 3, 6, 6);
    }
    ctx.fillStyle = "#27463c";
    ctx.font = "600 11px system-ui";
    ctx.textAlign = "center";
    for (const [label, x, y] of [
      ["LF", 0.24, 0.3],
      ["CF", 0.5, 0.12],
      ["RF", 0.76, 0.3],
      ["HOME", 0.5, 0.99],
    ] as const)
      ctx.fillText(label, W * x, H * y);
    if (showPoints)
      for (const e of visible) {
        ctx.beginPath();
        ctx.arc((e.x / 100) * W, (e.y / 100) * H, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.strokeStyle = "#203c35";
        ctx.stroke();
      }
  }, [visible, spread, showPoints]);
  function inspect(clientX: number, clientY: number) {
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * 100,
      y = ((clientY - rect.top) / rect.height) * 100;
    let nearest: PlayEvent | null = null,
      distance = 24;
    for (const e of visible) {
      const d = Math.hypot(
        ((e.x - x) / 100) * rect.width,
        ((e.y - y) / 100) * rect.height,
      );
      if (d < distance) {
        nearest = e;
        distance = d;
      }
    }
    setSelected(nearest);
  }
  return (
    <section className="nf-heatmap" aria-label="Contact density map">
      <div className="nf-heat-controls">
        <div role="group" aria-label="Batting team">
          {(["all", "us", "them"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={team === value}
              className={team === value ? "bg-d-sel" : ""}
              onClick={() => setTeam(value)}
            >
              {value === "all"
                ? "Both teams"
                : value === "us"
                  ? brand.name
                  : "Opponent"}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Contact outcome">
          {(["all", "hits", "outs"] as const).map((value) => (
            <button
              key={value}
              aria-pressed={outcome === value}
              className={outcome === value ? "bg-d-sel" : ""}
              onClick={() => setOutcome(value)}
            >
              {value === "all"
                ? "All contact"
                : value === "hits"
                  ? "Hits"
                  : "Contact outs"}
            </button>
          ))}
        </div>
        <label>
          Smoothing
          <input
            aria-label="Heat map smoothing"
            type="range"
            min={12}
            max={48}
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(e) => setShowPoints(e.target.checked)}
          />{" "}
          Show contacts
        </label>
      </div>
      <div className="nf-heat-field">
        <canvas
          ref={canvas}
          width={W}
          height={H}
          role="img"
          aria-label={`Contact density: ${visible.length} mapped contacts. Blue indicates lower concentration, red the highest concentration in this selection.`}
          onPointerMove={(e) => {
            if (e.pointerType === "mouse") inspect(e.clientX, e.clientY);
          }}
          onClick={(e) => inspect(e.clientX, e.clientY)}
        />
        {(loading || error || !visible.length) && (
          <div className="nf-heat-empty">
            {loading ? (
              "Loading contact…"
            ) : error ? (
              <>
                <span role="alert">{error}</span>
                <button
                  onClick={() => {
                    setLoaded(null);
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry
                </button>
              </>
            ) : (
              "No mapped contact for this selection."
            )}
          </div>
        )}
      </div>
      <div className="nf-heat-legend">
        <span>Lower concentration</span>
        <div aria-hidden="true" />
        <span>Higher</span>
      </div>
      <p className="nf-heat-caption">
        <strong>{visible.length} mapped contacts</strong> · Relative density
        within this selection. Colors show frequency, not team or outcome. Walks
        and strikeouts are excluded. Imported zone locations may be approximate.
      </p>
      {selected && (
        <div className="nf-heat-detail" role="status">
          <strong>{selected.batter}</strong> ·{" "}
          {selected.result.replaceAll("_", " ")} · Inning {selected.inning}
          <br />
          {selected.battingTeam === "us" ? brand.name : "Opponent"} ·{" "}
          {selected.zone?.replaceAll("_", " ")}
          {selected.description && <p>{selected.description}</p>}
        </div>
      )}
      <details>
        <summary>View mapped contacts ({visible.length})</summary>
        <div className="nf-table-scroll">
          <table className="nf-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Team</th>
                <th>Result</th>
                <th>Inning</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((e, i) => (
                <tr key={`${e.id}:${i}`}>
                  <td>{e.batter}</td>
                  <td>{e.battingTeam === "us" ? brand.name : "Opponent"}</td>
                  <td>{e.result.replaceAll("_", " ")}</td>
                  <td>{e.inning}</td>
                  <td>{e.zone?.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
