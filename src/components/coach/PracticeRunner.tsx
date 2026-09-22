"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PracticeBlock } from "@/lib/practice/templates";
import type { Drill } from "@/lib/practice/drills";

type SavedRun = {
  version: 1;
  index: number;
  remaining: number;
  running: boolean;
  savedAt: number;
  complete: boolean;
};

const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function initialState(planId: string, blocks: PracticeBlock[]): SavedRun {
  const fallback: SavedRun = {
    version: 1,
    index: 0,
    remaining: (blocks[0]?.durationMinutes ?? 0) * 60,
    running: false,
    savedAt: Date.now(),
    complete: false,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(`inningwise:practice-run:v1:${planId}`) ?? "null") as SavedRun | null;
    if (!parsed || parsed.version !== 1 || parsed.index < 0 || parsed.index >= blocks.length) return fallback;
    const elapsed = parsed.running ? Math.max(0, Math.floor((Date.now() - parsed.savedAt) / 1000)) : 0;
    const remaining = Math.max(0, parsed.remaining - elapsed);
    return { ...parsed, remaining, running: parsed.running && remaining > 0, savedAt: Date.now() };
  } catch {
    return fallback;
  }
}

export default function PracticeRunner({
  planId,
  planName,
  blocks,
  drills,
}: {
  planId: string;
  planName: string;
  blocks: PracticeBlock[];
  drills: Drill[];
}) {
  const storageKey = `inningwise:practice-run:v1:${planId}`;
  const [state, setState] = useState<SavedRun>(() => initialState(planId, blocks));
  const [deadline, setDeadline] = useState<number | null>(() =>
    state.running ? Date.now() + state.remaining * 1000 : null,
  );
  const [wakeMessage, setWakeMessage] = useState("");
  const drillMap = useMemo(() => new Map(drills.map((drill) => [drill.id, drill])), [drills]);
  const block = blocks[state.index];
  const blockSeconds = (block?.durationMinutes ?? 0) * 60;
  const completedSeconds = blocks
    .slice(0, state.index)
    .reduce((sum, item) => sum + item.durationMinutes * 60, 0);
  const totalSeconds = blocks.reduce((sum, item) => sum + item.durationMinutes * 60, 0);
  const elapsedSeconds = completedSeconds + Math.max(0, blockSeconds - state.remaining);
  const progress = totalSeconds ? Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)) : 0;

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({ ...state, savedAt: Date.now() }));
  }, [state, storageKey]);

  useEffect(() => {
    if (!state.running || deadline === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setState((current) => {
        const running = remaining > 0;
        if (current.remaining === remaining && current.running === running) return current;
        return { ...current, remaining, running, savedAt: Date.now() };
      });
      if (remaining === 0) {
        setDeadline(null);
        navigator.vibrate?.([160, 80, 160]);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [deadline, state.running]);

  useEffect(() => {
    if (!state.running || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } })
      .wakeLock.request("screen")
      .then((value) => {
        if (cancelled) void value.release();
        else lock = value;
      })
      .catch(() => setWakeMessage("Keep this screen awake while practice runs."));
    return () => {
      cancelled = true;
      if (lock) void lock.release();
    };
  }, [state.running]);

  function startPause() {
    if (state.running) {
      const remaining = deadline === null ? state.remaining : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setDeadline(null);
      setState((current) => ({ ...current, remaining, running: false, savedAt: Date.now() }));
    } else if (state.remaining > 0) {
      setDeadline(Date.now() + state.remaining * 1000);
      setState((current) => ({ ...current, running: true, complete: false, savedAt: Date.now() }));
    }
  }

  function move(nextIndex: number) {
    const complete = nextIndex >= blocks.length;
    const index = Math.max(0, Math.min(nextIndex, blocks.length - 1));
    setDeadline(null);
    setState({
      version: 1,
      index,
      remaining: complete ? 0 : blocks[index].durationMinutes * 60,
      running: false,
      savedAt: Date.now(),
      complete,
    });
  }

  function resetPractice() {
    setDeadline(null);
    setState({
      version: 1,
      index: 0,
      remaining: (blocks[0]?.durationMinutes ?? 0) * 60,
      running: false,
      savedAt: Date.now(),
      complete: false,
    });
  }

  if (state.complete)
    return (
      <section className="nf-card nf-run-complete" aria-live="polite">
        <p className="nf-eyebrow">PRACTICE COMPLETE</p>
        <h2>That’s a wrap.</h2>
        <p>{planName} · {blocks.length} stations · {Math.round(totalSeconds / 60)} planned minutes</p>
        <div className="nf-action-row">
          <button onClick={resetPractice}>Run it again</button>
          <Link className="nf-button nf-secondary" href={`/coach/practice/${planId}`}>Back to plan</Link>
        </div>
      </section>
    );

  return (
    <div className="nf-practice-runner">
      <section className="nf-card nf-run-status">
        <div className="nf-run-heading">
          <div>
            <p className="nf-eyebrow">STATION {state.index + 1} OF {blocks.length}</p>
            <h2>{block?.label}</h2>
          </div>
          <span>{progress}% complete</span>
        </div>
        <progress max={100} value={progress}>{progress}%</progress>
        <div className={`nf-practice-clock${state.remaining === 0 ? " nf-clock-done" : ""}`} role="timer" aria-live="off">
          {formatClock(state.remaining)}
        </div>
        <p className="nf-muted">{state.remaining === 0 ? "Time. Rotate when the field is ready." : `${block?.durationMinutes} minutes planned`}</p>
        {wakeMessage && <p className="nf-notice">{wakeMessage}</p>}
        <div className="nf-timer-actions">
          <button className="nf-secondary" disabled={state.index === 0 || state.running} onClick={() => move(state.index - 1)}>← Previous</button>
          <button className="nf-timer-primary" disabled={state.remaining === 0} onClick={startPause}>{state.running ? "Pause" : "Start timer"}</button>
          <button className="nf-secondary" onClick={() => {
            const remaining = state.remaining + 60;
            setState((current) => ({ ...current, remaining }));
            if (state.running) setDeadline(Date.now() + remaining * 1000);
          }}>+ 1 min</button>
          <button onClick={() => move(state.index + 1)}>{state.index === blocks.length - 1 ? "Finish practice" : "Next station →"}</button>
        </div>
      </section>

      <section className="nf-card nf-run-drills">
        <p className="nf-eyebrow">RUN THIS STATION</p>
        {(block?.drillIds ?? []).map((id) => {
          const drill = drillMap.get(id);
          return drill ? (
            <details key={id} open>
              <summary><strong>{drill.name}</strong> · {drill.durationMinutes} min</summary>
              <p><strong>Setup:</strong> {drill.setup}</p>
              <ol>{drill.instructions.map((step, index) => <li key={index}>{step}</li>)}</ol>
              {drill.coachingCue && <p className="nf-coach-cue">Coach cue: {drill.coachingCue}</p>}
            </details>
          ) : <p className="nf-notice" key={id}>A drill in this station is unavailable.</p>;
        })}
      </section>
    </div>
  );
}
