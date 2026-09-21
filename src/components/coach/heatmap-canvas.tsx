"use client";

import { useEffect, useState, useRef, useCallback, useLayoutEffect } from "react";
import type { PlayEvent } from "@/lib/coach/types";
import { drawBaseballField } from "@/lib/coach/field-geometry";
import { useCoachBrand } from "@/lib/coach/org-client";

interface HeatmapCanvasProps {
  gameId?: string;
  events?: PlayEvent[];
  visualStyle?: "classic" | "mesh"; // accepted for back-compat; rendering is unified
}

type TeamFilter = "all" | "us" | "them";
type LayerFilter = "all" | "hits" | "missed";
type RGB = [number, number, number];

const HIT_RESULTS = ["single", "double", "triple", "home_run"];
const OUT_RESULTS = ["out", "strikeout", "fielders_choice"];
const isHit = (r: string) => HIT_RESULTS.includes(r);
const isOut = (r: string) => OUT_RESULTS.includes(r);

// Which reference layer does an event belong to?
//   green = our hits · red = their hits · grey = any out/miss
type Layer = "usHit" | "oppHit" | "missed" | null;
function layerOf(e: PlayEvent): Layer {
  if (e.battingTeam === "us" && isHit(e.result)) return "usHit";
  if (e.battingTeam === "them" && isHit(e.result)) return "oppHit";
  if (isOut(e.result)) return "missed";
  return null; // walks/errors/fouls aren't plotted on the contact heat map
}

function resultLabel(e: PlayEvent): string {
  const labels: Record<string, string> = {
    single: "Single", double: "Double", triple: "Triple", home_run: "Home Run",
    out: "Out", strikeout: "Strikeout", walk: "Walk", error: "Error",
    fielders_choice: "Fielder's Choice", foul: "Foul",
  };
  return labels[e.result] ?? e.result;
}

// ─── Canvas dimensions ────────────────────────────────────────────────────────
const CW = 648;
const CH = 432;

// ─── Density heatmap (manual separable box blur ≈ Gaussian; browser-independent) ─
function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(w - 1, Math.max(0, i))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc * norm;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc * norm;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

function densityField(events: PlayEvent[], r: number): Float32Array {
  const g = new Float32Array(CW * CH);
  for (const e of events) {
    const xi = Math.round((e.x / 100) * CW);
    const yi = Math.round((e.y / 100) * CH);
    if (xi >= 0 && xi < CW && yi >= 0 && yi < CH) g[yi * CW + xi] += 1;
  }
  boxBlur(g, CW, CH, r); boxBlur(g, CW, CH, r); boxBlur(g, CW, CH, r);
  let max = 0;
  for (let i = 0; i < g.length; i++) if (g[i] > max) max = g[i];
  if (max > 0) for (let i = 0; i < g.length; i++) g[i] /= max; // per-layer normalize
  return g;
}

const smoothstep = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

type HeatLayer = { events: PlayEvent[]; color: RGB; tint: RGB; weight: number };

// Opacity-driven density. Hue stays the team color (no white core); the dominant
// layer paints each pixel and the runner-up blends in for organic transitions.
function renderDensityHeat(ctx: CanvasRenderingContext2D, layers: HeatLayer[], radius: number) {
  const fields = layers
    .filter((l) => l.events.length > 0)
    .map((l) => ({ ...l, f: densityField(l.events, radius) }));
  if (fields.length === 0) return;

  const GAMMA = 0.58, MAXA = 0.96;
  const out = new ImageData(CW, CH);
  for (let i = 0; i < CW * CH; i++) {
    let best = -1, bestD = 0, second = -1, secondD = 0;
    for (let l = 0; l < fields.length; l++) {
      const d = fields[l].f[i] * fields[l].weight;
      if (d > bestD) { second = best; secondD = bestD; best = l; bestD = d; }
      else if (d > secondD) { second = l; secondD = d; }
    }
    if (best < 0 || bestD < 0.02) continue;

    const a = smoothstep(Math.pow(bestD, GAMMA)) * MAXA;
    const L = fields[best];
    const t = Math.pow(bestD, 2.2) * 0.45;
    let cr = L.color[0] + (L.tint[0] - L.color[0]) * t;
    let cg = L.color[1] + (L.tint[1] - L.color[1]) * t;
    let cb = L.color[2] + (L.tint[2] - L.color[2]) * t;
    if (second >= 0 && secondD > 0.02) {
      const mix = 0.5 * (secondD / bestD);
      const S = fields[second];
      cr = cr * (1 - mix) + S.color[0] * mix;
      cg = cg * (1 - mix) + S.color[1] * mix;
      cb = cb * (1 - mix) + S.color[2] * mix;
    }
    const di = i * 4;
    out.data[di] = cr; out.data[di + 1] = cg; out.data[di + 2] = cb;
    out.data[di + 3] = Math.round(a * 255);
  }

  const tmp = document.createElement("canvas");
  tmp.width = CW; tmp.height = CH;
  tmp.getContext("2d")!.putImageData(out, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

// Average contact location marker (blue pin), like the reference image.
function drawAvgMarker(ctx: CanvasRenderingContext2D, events: PlayEvent[]) {
  if (events.length === 0) return;
  let sx = 0, sy = 0;
  for (const e of events) { sx += (e.x / 100) * CW; sy += (e.y / 100) * CH; }
  const cx = sx / events.length, cy = sy / events.length;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6;
  ctx.fillStyle = "#3b82f6";
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("AVG", cx, cy - 12);
  ctx.restore();
}

// ─── Layer palette (sampled toward the reference: grass-green, clean red, blue-grey) ─
const C_GREEN: RGB = [40, 200, 92];
const C_GREEN_T: RGB = [165, 240, 160];
const C_RED: RGB = [228, 48, 48];
const C_RED_T: RGB = [255, 150, 150];
const C_GREY: RGB = [104, 116, 134];
const C_GREY_T: RGB = [165, 175, 190];

// ─── Component ────────────────────────────────────────────────────────────────
export default function HeatmapCanvas({ gameId, events: propEvents }: HeatmapCanvasProps) {
  const brandTeam = useCoachBrand();
  const [fetchedEvents, setFetchedEvents] = useState<PlayEvent[]>([]);
  const [loading, setLoading] = useState(() => !!gameId && propEvents === undefined);
  const [error, setError] = useState<string | null>(null);
  const events = propEvents ?? fetchedEvents;
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("all");
  const [layerFilter, setLayerFilter] = useState<LayerFilter>("all");
  const [blobRadius, setBlobRadius] = useState(30);
  const [hoveredEvent, setHoveredEvent] = useState<PlayEvent | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const fieldCanvasRef = useRef<HTMLCanvasElement>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (propEvents !== undefined) return;
    if (!gameId) return;
    fetch(`/api/coach/baseball/play-events?id=${gameId}&team=all`)
      .then((r) => (r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`)))
      .then((data) => {
        if (data.ok) setFetchedEvents(data.events ?? []);
        else setError(data.error ?? "Failed to load");
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [gameId, propEvents]);

  useLayoutEffect(() => {
    const canvas = fieldCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true })!;
    ctx.clearRect(0, 0, CW, CH);
    drawBaseballField(ctx, CW, CH);
  }, []);

  // Events filtered by the team toggle and split into the three reference layers.
  const filtered = events.filter((e) => {
    if (teamFilter === "us" && e.battingTeam !== "us") return false;
    if (teamFilter === "them" && e.battingTeam !== "them") return false;
    return layerOf(e) !== null;
  });
  const usHits = filtered.filter((e) => layerOf(e) === "usHit");
  const oppHits = filtered.filter((e) => layerOf(e) === "oppHit");
  const missed = filtered.filter((e) => layerOf(e) === "missed");

  const drawHeat = useCallback(() => {
    const canvas = heatCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, CW, CH);

    const layers: HeatLayer[] = [];
    if (layerFilter !== "hits") layers.push({ events: missed, color: C_GREY, tint: C_GREY_T, weight: 0.68 });
    if (layerFilter !== "missed") {
      layers.push({ events: usHits, color: C_GREEN, tint: C_GREEN_T, weight: 1.0 });
      layers.push({ events: oppHits, color: C_RED, tint: C_RED_T, weight: 1.0 });
    }
    renderDensityHeat(ctx, layers, blobRadius);
    drawAvgMarker(ctx, layers.flatMap((l) => l.events));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, teamFilter, layerFilter, blobRadius]);

  useEffect(() => { drawHeat(); }, [drawHeat]);

  const getNearestEvent = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container || events.length === 0) return null;
    const rect = container.getBoundingClientRect();
    const cx = (clientX - rect.left) * (CW / rect.width);
    const cy = (clientY - rect.top) * (CH / rect.height);
    let nearest: PlayEvent | null = null;
    let minDist = Infinity;
    for (const e of events) {
      const d = Math.hypot((e.x / 100) * CW - cx, (e.y / 100) * CH - cy);
      if (d < minDist) { minDist = d; nearest = e; }
    }
    return minDist < blobRadius * 1.4 ? nearest : null;
  }, [events, blobRadius]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setHoveredEvent(getNearestEvent(e.clientX, e.clientY));
    setHoverPos({ x: e.clientX, y: e.clientY });
  };

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    let clientX: number, clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX; clientY = (e as React.MouseEvent).clientY;
    }
    const nearest = getNearestEvent(clientX, clientY);
    setHoveredEvent(nearest);
    if (nearest) setHoverPos({ x: clientX, y: clientY });
  };

  const total = usHits.length + oppHits.length + missed.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center bg-d-sunken p-3 rounded-lg">
        <div className="flex gap-1 flex-wrap">
          {(["all", "us", "them"] as TeamFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setTeamFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold min-h-[40px] transition-all active:scale-[0.985] ${
                teamFilter === f ? "bg-d-sel text-white" : "bg-d-sunken text-d-ink-2"
              }`}
            >
              {f === "all" ? "All ABs" : f === "us" ? brandTeam.name : "Opponent"}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {(["all", "hits", "missed"] as LayerFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setLayerFilter(f)}
              className={`px-3 py-1 rounded text-xs font-semibold transition-colors min-h-[32px] ${
                layerFilter === f ? "bg-d-sel text-white" : "bg-d-sunken text-d-ink-2"
              }`}
            >
              {f === "all" ? "All" : f === "hits" ? "Hits" : "Missed"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-d-ink-2">
          <span>Spread</span>
          <input
            type="range" min={18} max={60} value={blobRadius}
            onChange={(e) => setBlobRadius(Number(e.target.value))}
            className="w-24 h-1 accent-blue-500"
          />
        </div>

        <div className="ml-auto flex gap-3 text-xs">
          <span className="text-d-pos font-semibold">● {usHits.length} {brandTeam.name} hits</span>
          <span className="text-d-neg font-semibold">● {oppHits.length} OPP hits</span>
          <span className="text-d-ink-3 font-semibold">● {missed.length} missed</span>
        </div>
      </div>

      {/* Canvas stack */}
      <div
        ref={containerRef}
        className="relative mx-auto w-full max-w-[620px] rounded-xl overflow-hidden cursor-crosshair select-none touch-manipulation"
        style={{ aspectRatio: `${CW}/${CH}`, background: "#0b0d12" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredEvent(null)}
        onClick={handleTap}
        onTouchStart={handleTap}
      >
        <canvas ref={fieldCanvasRef} width={CW} height={CH} className="absolute inset-0 w-full h-full" />
        <canvas ref={heatCanvasRef} width={CW} height={CH} className="absolute inset-0 w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-d-ink/60">
            <span className="text-white text-sm">Loading events…</span>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-d-ink/60">
            <span className="text-rose-200 text-sm">{error}</span>
          </div>
        )}
        {!gameId && propEvents === undefined && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white/80 text-sm">Select a game to view heatmap</span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 bg-d-ink/75 text-white rounded-lg px-3 py-1.5 text-xs flex items-center gap-4 backdrop-blur-sm border border-white/10">
          <div className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#28c85c]" /> {brandTeam.name} hits</div>
          <div className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#e43030]" /> Opponent hits</div>
          <div className="flex items-center gap-1.5 text-white/70"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#68748a]" /> Missed</div>
        </div>
      </div>

      {/* Contact summary (reference-style percentages) */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-d-surface border border-d-line px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-d-ink-3">{brandTeam.name} Hits</div>
          <div className="text-sm font-black text-d-pos tabular-nums">{usHits.length} · {pct(usHits.length)}%</div>
        </div>
        <div className="rounded-lg bg-d-surface border border-d-line px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-d-ink-3">Opponent Hits</div>
          <div className="text-sm font-black text-d-neg tabular-nums">{oppHits.length} · {pct(oppHits.length)}%</div>
        </div>
        <div className="rounded-lg bg-d-surface border border-d-line px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-d-ink-3">Missed</div>
          <div className="text-sm font-black text-d-ink-2 tabular-nums">{missed.length} · {pct(missed.length)}%</div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredEvent && (
        <div
          className="fixed z-50 pointer-events-none bg-d-surface text-d-ink rounded-lg shadow-xl px-4 py-3 text-sm border border-d-line-str"
          style={{ left: hoverPos.x + 14, top: hoverPos.y - 80 }}
        >
          <div className="font-bold text-base">
            {hoveredEvent.batter}
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${
              isHit(hoveredEvent.result) ? "bg-d-pos/12 text-d-pos"
              : isOut(hoveredEvent.result) ? "bg-d-sunken text-d-ink" : "bg-d-sel/12 text-d-sel"
            }`}>
              {isHit(hoveredEvent.result) ? "HIT" : isOut(hoveredEvent.result) ? "OUT" : "ON BASE"}
            </span>
          </div>
          <div className="text-d-warn font-semibold">{resultLabel(hoveredEvent)}</div>
          <div className="text-d-ink-2 mt-1">
            {hoveredEvent.battingTeam === "us" ? brandTeam.name : "Opponent"} · Inning {hoveredEvent.inning}
          </div>
          <div className="text-d-ink-3 text-xs mt-1">Zone: {hoveredEvent.zone?.replace(/_/g, " ")}</div>
          {hoveredEvent.description && (
            <div className="text-d-ink-2 text-xs mt-1 max-w-[220px]">{hoveredEvent.description}</div>
          )}
        </div>
      )}
    </div>
  );
}
