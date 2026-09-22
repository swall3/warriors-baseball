"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import {
  QUIZ_SESSION_SIZE,
  chunkIntoSessions,
} from "@/lib/practice/sessions";
export type PracticeRow = {
  id: string;
  player_id: string;
  scenario_id: string;
  game_id: string | null;
  note: string;
  created_at: string;
  attempts: number;
  correct: number;
  bundle_assignment_id: string | null;
  bundle_position: number | null;
};
type Run = {
  ids: string[];
  index: number;
  endsAt: number | null;
  remaining: number;
  minutes: number;
  /** Which session of the assigned work this run is (Decision 4). Optional so
   *  a run saved before this change still restores; it reads as session 1. */
  session?: number;
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
        (saved.session === undefined ||
          (Number.isInteger(saved.session) && saved.session >= 0)) &&
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
  // Group any position-practice bundle's scenarios together, in the order the
  // coach assigned them (bundle_position), while leaving standalone
  // assignments in their existing order. Rows arrive newest-first from the
  // API, so a stable sort keyed by "bundle group, then position within it"
  // keeps a bundle's reps contiguous without disturbing anything else.
  const eligible = rows.filter(
    (r) =>
      r.player_id === playerId &&
      players.some((p) => p.id === r.player_id) &&
      BACKUP_SCENARIOS.some((s) => s.id === r.scenario_id),
  );
  const groupFirstIndex = new Map<string, number>();
  eligible.forEach((r, index) => {
    const group = r.bundle_assignment_id ?? `solo:${r.id}`;
    if (!groupFirstIndex.has(group)) groupFirstIndex.set(group, index);
  });
  const available = eligible
    .map((r, index) => ({ r, index }))
    .sort((a, b) => {
      const groupA = groupFirstIndex.get(a.r.bundle_assignment_id ?? `solo:${a.r.id}`)!;
      const groupB = groupFirstIndex.get(b.r.bundle_assignment_id ?? `solo:${b.r.id}`)!;
      if (groupA !== groupB) return groupA - groupB;
      return (a.r.bundle_position ?? 0) - (b.r.bundle_position ?? 0);
    })
    .map(({ r }) => r);
  // Session cap (Decision 4): a position-practice bundle can be 30+ reps, and
  // nobody — kid or coach — runs 30 timed blocks in a sitting. The assigned
  // work is split into sessions of at most QUIZ_SESSION_SIZE, run one at a
  // time, with the rest waiting. Order is the coach's assigned order, so the
  // split is contiguous: session 1 is reps 1-12, session 2 picks up at 13.
  //
  // Deliberately NOT sharing a counter with the free-play position game: an
  // assigned bundle always starts at its own session 1, so a kid who has been
  // free-playing shortstop doesn't open the coach's assignment on session 3.
  const sessions = chunkIntoSessions(available);
  const sessionIndex = run?.session ?? 0;
  const sessionCountTotal = sessions.length;
  const upNext = sessions[0] ?? [];
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
          ? `Block ${run.index + 1} of ${run.ids.length}${
              sessionCountTotal > 1
                ? ` · Session ${sessionIndex + 1} of ${sessionCountTotal}`
                : ""
            }`
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
            {sessionCountTotal > 1
              ? `${upNext.length} in this session · ${upNext.length * minutes} minutes planned`
              : `${available.length * minutes} minutes planned`}
          </p>
          {sessionCountTotal > 1 && (
            <p className="nf-muted">
              Split into {sessionCountTotal} sessions of at most{" "}
              {QUIZ_SESSION_SIZE} reps. Finish this one and start the next when
              the player is fresh — the assignment and its answers are saved
              either way.
            </p>
          )}
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
              !upNext.length ||
              !Number.isInteger(minutes) ||
              minutes < 1 ||
              minutes > 30
            }
            onClick={() =>
              save({
                ids: upNext.map((r) => r.id),
                index: 0,
                session: 0,
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
            {run.index + 1 >= run.ids.length &&
              sessionIndex + 1 < sessionCountTotal && (
                <button
                  onClick={() => {
                    const next = sessions[sessionIndex + 1] ?? [];
                    save({
                      ids: next.map((r) => r.id),
                      index: 0,
                      session: sessionIndex + 1,
                      remaining: run.minutes * 60000,
                      endsAt: Date.now() + run.minutes * 60000,
                      minutes: run.minutes,
                    });
                  }}
                >
                  Start session {sessionIndex + 2} of {sessionCountTotal}
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
