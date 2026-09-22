"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import PracticeSession from "@/components/coach/PracticeSession";
import Link from "next/link";
import PracticeAssignment from "@/components/coach/PracticeAssignment";
import { Diamond, FIELD_POS } from "@/components/Diamond";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
type Assignment = {
  id: string;
  player_id: string;
  scenario_id: string;
  game_id: string | null;
  note: string;
  created_at: string;
  attempts: number;
  correct: number;
};
export default function Training() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const params = useSearchParams();
  const [player, setPlayer] = useState(params.get("player") ?? "");
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState<Assignment | null>(null);
  const lessonHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (active) lessonHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [active]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    explanation: string;
  } | null>(null);
  const [pending, setPending] = useState<{ id: string; answer: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const playerId = player || catalog?.players[0]?.id;
  const name =
    catalog?.players.find((p) => p.id === playerId)?.display_name ?? "Player";
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/training", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setRows(d.assignments);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [version]);
  async function submit(value: string, retryAttempt = false) {
    if (!active || busy) return;
    const attempt =
      retryAttempt && pending
        ? pending
        : { id: crypto.randomUUID(), answer: value };
    setPending(attempt);
    setBusy(true);
    setAnswer(attempt.answer);
    try {
      const r = await fetch(`/api/coach/training/${active.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setFeedback(d);
      setPending(null);
      setError("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const scenario = BACKUP_SCENARIOS.find((s) => s.id === active?.scenario_id);
  if (active && scenario)
    return (
      <div className="nf-workspace nf-practice">
        <header className="nf-top">
          <strong className="nf-wordmark">NINETY FEET /</strong>
          <button
            className="nf-secondary"
            disabled={!!pending}
            onClick={() => {
              setActive(null);
              setFeedback(null);
              setAnswer(null);
            }}
          >
            Back to practice
          </button>
        </header>
        <main className="nf-practice-main">
          <p className="nf-eyebrow">
            {catalog?.organization.short_name ?? catalog?.organization.name} ·{" "}
            {name.toUpperCase()}’S PRACTICE
          </p>
          <h1 ref={lessonHeading} tabIndex={-1}>
            {feedback?.correct ? "You’ve got it!" : scenario.question}
          </h1>
          {active.note && (
            <p className="nf-coach-note">Coach says: {active.note}</p>
          )}
          <div className="nf-practice-grid">
            <section className="nf-practice-diamond">
              <Diamond
                runners={scenario.runners}
                ballZone={scenario.ballZone}
                targetZone={feedback?.correct ? scenario.targetZone : undefined}
                tappedZone={answer}
                tapState={
                  feedback ? (feedback.correct ? "correct" : "wrong") : null
                }
                onTap={(value) => void submit(value)}
                interactive={!busy && !pending && !feedback?.correct}
                showRelay={scenario.ballReachesTarget !== false}
              />
              <div
                className="nf-answer-buttons"
                aria-label="Choose a field position"
              >
                {Object.keys(FIELD_POS).map((p) => (
                  <button
                    key={p}
                    disabled={busy || !!pending || !!feedback?.correct}
                    onClick={() => void submit(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </section>
            <section className="nf-card">
              <p className="nf-eyebrow">{scenario.label}</p>
              <h2>
                {feedback?.correct
                  ? "Every rep builds confidence."
                  : "Find the teammate who can help."}
              </h2>
              <p role="status">
                {feedback?.explanation ??
                  "Tap a position on the field, or choose its button below."}
              </p>
              <p className="nf-muted">
                Nine-position practice field. Ask your coach how your team calls
                its assignments.
              </p>
              {error && (
                <p className="nf-notice" role="alert">
                  {error}
                </p>
              )}
              {pending && !busy && (
                <>
                  <p>
                    Your answer is not confirmed yet. Retry the same answer to
                    avoid losing the rep.
                  </p>
                  <button onClick={() => void submit(pending.answer, true)}>
                    Retry saving answer
                  </button>
                  <button
                    className="nf-secondary"
                    onClick={() => {
                      setPending(null);
                      setError("");
                    }}
                  >
                    Leave answer unconfirmed
                  </button>
                </>
              )}
              {feedback?.correct && (
                <>
                  <p>Saved to {name}’s practice progress.</p>
                  <button
                    onClick={() => {
                      setActive(null);
                      setFeedback(null);
                      setAnswer(null);
                    }}
                  >
                    Done for now
                  </button>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    );
  return (
    <Workspace catalog={catalog} active="Play & Learn">
      <section className="nf-intro">
        <p className="nf-eyebrow">PLAYER DEVELOPMENT</p>
        <h2>A few reps. A little more ready.</h2>
        <p>Choose a player and open the practice their coach assigned.</p>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}{" "}
      {error && (
        <LoadError error={error} retry={() => setVersion((v) => v + 1)} />
      )}
      <label className="nf-label">
        Practicing as
        <select
          value={playerId ?? ""}
          onChange={(e) => setPlayer(e.target.value)}
        >
          {catalog?.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      </label>
      <p className="nf-muted">
        Team sign-in is shared. An adult should confirm the selected player;
        these are not individual child accounts.
      </p>
      {catalog && (
        <section className="nf-card nf-section" aria-label="Player progress">
          <p className="nf-eyebrow">{name.toUpperCase()} · PRACTICE PROGRESS</p>
          <h3>Build on the last rep.</h3>
          <p>
            {
              rows.filter((a) => a.player_id === playerId && a.correct > 0)
                .length
            }{" "}
            of {rows.filter((a) => a.player_id === playerId).length} assigned
            activities have a successful answer.
          </p>
          <p className="nf-muted">
            Based on recorded answers to assigned field-position questions. This
            measures practice here, not game performance or a full skill
            evaluation.
          </p>
        </section>
      )}
      {catalog && catalog.role !== "viewer" && (
        <PracticeSession
          key={catalog.organization.id}
          orgId={catalog.organization.id}
          rows={rows}
          playerId={playerId}
          players={catalog.players}
          onPractice={(a) => {
            setPlayer(a.player_id);
            setActive(a);
            setAnswer(null);
            setFeedback(null);
            setPending(null);
            setError("");
          }}
        />
      )}
      <div className="nf-roster">
        {rows
          .filter((a) => a.player_id === playerId)
          .map((a) => (
            <section className="nf-card" key={a.id}>
              <p className="nf-eyebrow">
                {a.correct > 0 ? "COMPLETED" : "ASSIGNED PRACTICE"}
              </p>
              <h3>
                {BACKUP_SCENARIOS.find((s) => s.id === a.scenario_id)?.label ??
                  "Practice unavailable"}
              </h3>
              {a.note && <p>{a.note}</p>}
              <p className="nf-muted">
                Assigned {new Date(a.created_at).toLocaleDateString()}
              </p>
              {a.game_id && (
                <p>
                  <Link href={`/coach/live/${a.game_id}/insights`}>
                    View source game →
                  </Link>
                </p>
              )}
              <p>
                {a.correct} successful reps · {a.attempts} answers
              </p>
              <button
                onClick={() => {
                  setActive(a);
                  setAnswer(null);
                  setFeedback(null);
                  setPending(null);
                  setError("");
                }}
              >
                Let’s practice →
              </button>
            </section>
          ))}
      </div>
      {!error && !rows.some((a) => a.player_id === playerId) && (
        <p className="nf-card">No assigned practice for {name} yet.</p>
      )}
      {catalog && catalog.role !== "viewer" && (
        <div className="nf-section">
          <PracticeAssignment
            key={playerId}
            players={catalog.players
              .filter((p) => p.id === playerId)
              .map((p) => ({ id: p.id, name: p.display_name }))}
            onAssigned={() => setVersion((v) => v + 1)}
          />
        </div>
      )}
    </Workspace>
  );
}
