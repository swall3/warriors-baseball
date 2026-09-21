"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { PlayEvent } from "@/lib/coach/types";

interface SprayChartProps {
  gameId?: string;
  events?: PlayEvent[];
}

const HIT_RESULTS = new Set(["single", "double", "triple", "home_run", "hit"]);
const OUT_RESULTS = new Set(["out", "strikeout", "fielders_choice"]);

function markerClass(result: string) {
  if (HIT_RESULTS.has(result)) return "bg-d-pos";
  if (OUT_RESULTS.has(result)) return "bg-d-neg";
  return "bg-d-sel";
}

export default function SprayChart({ gameId, events: presetEvents }: SprayChartProps) {
  const [fetchedEvents, setFetchedEvents] = useState<PlayEvent[]>([]);
  const events = presetEvents ?? fetchedEvents;

  useEffect(() => {
    if (presetEvents) return;
    if (!gameId) return;

    fetch(`/api/coach/baseball/play-events?id=${gameId}&team=all`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.events)) setFetchedEvents(data.events);
      });
  }, [gameId, presetEvents]);

  return (
    <div className="space-y-4 p-4">
      <h2 className="mb-1 text-lg font-semibold text-d-ink">Spray Chart</h2>
      <p className="text-sm text-d-ink-2">
        {`Showing ${events.length} spray events`}
      </p>

      <div className="relative mx-auto aspect-[16/9] w-full overflow-hidden rounded-2xl border border-d-line bg-d-ink">
        <Image
          src="/coach/images/field-bg-combined-final.jpg?v=20260528-4"
          alt="Baseball field spray chart background"
          fill
          className="absolute inset-0 object-cover object-[center_36%]"
          sizes="(max-width: 1024px) 100vw, 66vw"
        />
        <div className="absolute inset-0 bg-d-ink/10" />
        {events.map((event, index) => (
          <div
            key={`${event.id}-${index}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 px-1.5 py-0.5 text-[10px] font-bold text-white shadow ${markerClass(event.result)}`}
            style={{ left: `${event.x}%`, top: `${event.y}%` }}
            title={`${event.batter} · ${event.result} · ${event.zone}`}
          >
            {event.result.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <p className="text-sm text-d-ink-3">
          No spray data available for this game.
        </p>
      )}
    </div>
  );
}
