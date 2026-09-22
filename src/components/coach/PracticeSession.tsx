"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
export type PracticeRow = {
  id: string;
  player_id: string;
  scenario_id: string;
  game_id: string | null;
  note: string;
  created_at: string;
  attempts: number;
  correct: number;
};
type Run = {
  ids: string[];
  index: number;
  endsAt: number | null;
  remaining: number;
  minutes: number;
};
export default function PracticeSession({
  orgId,
  rows,
  players,
  playerId,
  onPractice,
}: {
  playerId: string | undefined;
  orgId: string;
  rows: PracticeRow[];
  players: { id: string; display_name: string }[];
  onPractice: (row: PracticeRow) => void;
}) {
  const key = `ninety-feet:practice-run:${orgId}`;
  const [run, setRun] = useState<Run | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [clock, setClock] = useState(0);
  const [error, setError] = useState("");
  const [reviewStop, setReviewStop] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (
        saved &&
        Array.isArray(saved.ids) &&
        saved.ids.every((id: unknown) => typeof id === "string") &&
        Number.isInteger(saved.index) &&
        saved.index >= 0 &&
        saved.index < saved.ids.length &&
        Number.isFinite(saved.remaining) &&
        saved.remaining >= 0 &&
        Number.isFinite(saved.minutes) &&
        saved.minutes > 0 &&
        (saved.endsAt === null || Number.isFinite(saved.endsAt))
      )
        setRun(saved);
    } catch {
      setError(
        "The saved timer could not be restored. Your assigned practice is still saved.",
      );
    }
    setClock(Date.now());
    setLoaded(true);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [key]);
  function save(next: Run | null) {
    try {
      if (next) localStorage.setItem(key, JSON.stringify(next));
      else localStorage.removeItem(key);
      setRun(next);
      setError("");
      setClock(Date.now());
    } catch {
      setError(
        "This device cannot save a timer. Allow browser storage before starting.",
      );
    }
  }
  const available = rows.filter(
    (r) =>
      r.player_id === playerId &&
      players.some((p) => p.id === r.player_id) &&
      BACKUP_SCENARIOS.some((s) => s.id === r.scenario_id),
  );
  const current = rows.find((r) => r.id === run?.ids[run.index]);
  const scenario = BACKUP_SCENARIOS.find((s) => s.id === current?.scenario_id);
  const seconds = run
    ? Math.max(
        0,
        Math.ceil(
          (run.endsAt === null ? run.remaining : run.endsAt - clock) / 1000,
        ),
      )
    : 0;
  return (
    <section className="nf-card nf-section" aria-label="Run assigned practice">
      <p className="nf-eyebrow">COACH PRACTICE SESSION</p>
      <h3>
        {run
          ? `Block ${run.index + 1} of ${run.ids.length}`
          : "Turn assigned reps into a practice."}
      </h3>
      <p>
        Assignments and answers are shared with your team. This timer stays on
        this device and resumes after a reload. Other devices can open each
        player's practice separately.
      </p>
      {error && (
        <p role="alert" className="nf-notice">
          {error}
        </p>
      )}
      {!run ? (
        <>
          <p>
            {available.length} assigned activities ·{" "}
            {available.length * minutes} minutes planned
          </p>
          <label className="nf-label">
            Minutes per activity
            <input
              type="number"
              min={1}
              max={30}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <p className="nf-muted">
            Use the selected player's assignments in the order shown below.
            Equipment: a phone or tablet; a coach to discuss the situation.
          </p>
          <button
            disabled={
              !loaded ||
              !available.length ||
              !Number.isInteger(minutes) ||
              minutes < 1 ||
              minutes > 30
            }
            onClick={() =>
              save({
                ids: available.map((r) => r.id),
                index: 0,
                endsAt: Date.now() + minutes * 60000,
                remaining: minutes * 60000,
                minutes,
              })
            }
          >
            Start practice session
          </button>
        </>
      ) : (
        <>
          <h2>{scenario?.label ?? "Activity unavailable"}</h2>
          <p>
            {players.find((p) => p.id === current?.player_id)?.display_name ??
              "Player unavailable"}
          </p>
          <p className="nf-practice-clock" aria-label="Time remaining">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
          <p role="status">
            {seconds === 0
              ? "Time is up. Finish the rep, then choose the next activity."
              : run.endsAt === null
                ? "Timer paused"
                : "Practice running"}
          </p>
          {current?.note && <p className="nf-coach-note">{current.note}</p>}
          {scenario && <p>{scenario.question}</p>}
          {current?.game_id && (
            <Link href={`/coach/live/${current.game_id}/insights`}>
              Review the game that prompted this practice →
            </Link>
          )}
          <div className="nf-step-actions">
            <button
              className="nf-secondary"
              onClick={() =>
                save({
                  ...run,
                  remaining: seconds * 1000,
                  endsAt:
                    run.endsAt === null ? Date.now() + run.remaining : null,
                })
              }
            >
              {run.endsAt === null ? "Resume timer" : "Pause timer"}
            </button>
            <button
              className="nf-secondary"
              onClick={() =>
                save({
                  ...run,
                  remaining: seconds * 1000 + 60000,
                  endsAt:
                    run.endsAt === null
                      ? null
                      : Date.now() + seconds * 1000 + 60000,
                })
              }
            >
              Add one minute
            </button>
            {current && scenario && (
              <button onClick={() => onPractice(current)}>Open this rep</button>
            )}
            {run.index + 1 < run.ids.length && (
              <button
                onClick={() =>
                  save({
                    ...run,
                    index: run.index + 1,
                    remaining: run.minutes * 60000,
                    endsAt: Date.now() + run.minutes * 60000,
                  })
                }
              >
                Next activity
              </button>
            )}
            <button
              className="nf-secondary"
              onClick={() => setReviewStop(true)}
            >
              Finish session
            </button>
          </div>
          {reviewStop && (
            <div className="nf-notice">
              <p>
                Stop this device's timer? Player answers already saved remain in
                their progress. Advancing a timer does not mark a rep
                successful.
              </p>
              <button
                onClick={() => {
                  save(null);
                  setReviewStop(false);
                }}
              >
                Stop timer
              </button>
              <button
                className="nf-secondary"
                onClick={() => setReviewStop(false)}
              >
                Keep practicing
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
