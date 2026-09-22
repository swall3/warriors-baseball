"use client";
import { useState } from "react";
import {
  battingSide,
  type LiveGame,
  type Command,
} from "@/lib/coach/live/model";
export function GameCorrections({
  game,
  onCommand,
}: {
  game: LiveGame;
  onCommand: (c: Command) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="nf-card">
      <h3>Correct the game</h3>
      <p>
        Pause the recording crew before changing a count, score, runner or
        pitcher total. Every correction is saved with your reason.
      </p>
      <button
        className="nf-secondary"
        disabled={!!game.pending}
        onClick={() => setOpen(!open)}
      >
        {open ? "Cancel correction" : "Review a correction"}
      </button>
      {game.pending && <p>Finish or undo the ball in play first.</p>}
      {open && (
        <CorrectionForm key={game.revision} game={game} onCommand={onCommand} />
      )}
    </section>
  );
}
function CorrectionForm({
  game,
  onCommand,
}: {
  game: LiveGame;
  onCommand: (c: Command) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Extract<Command, { type: "correct" }>>(
    () => ({
      type: "correct",
      reason: "",
      balls: game.balls,
      strikes: game.strikes,
      outs: game.outs,
      score: { ...game.score },
      bases: {
        "1": game.bases["1"]?.id ?? null,
        "2": game.bases["2"]?.id ?? null,
        "3": game.bases["3"]?.id ?? null,
      },
      pitchCounts: { ...game.pitchCounts },
    }),
  );
  const [review, setReview] = useState(false);
  const players =
    battingSide(game) === "us" ? game.config.roster : game.config.opponentOrder;
  const names = Object.fromEntries(
    [...game.config.roster, ...Object.values(game.pitchers)].map((p) => [
      p.id,
      p.name,
    ]),
  );
  return (
    <div className="nf-section">
      <p>
        If another device updates the game, this form resets to the latest
        values. A correction does not rewrite historical hit/error rulings; undo
        the latest play and re-enter it for that.
      </p>
      <fieldset disabled={review} className="nf-controls">
        <div className="nf-form-grid">
          {(["balls", "strikes", "outs"] as const).map((k) => (
            <label className="nf-label" key={k}>
              {k}
              <input
                type="number"
                min={0}
                max={
                  k === "outs"
                    ? 2
                    : game.config.format === "coach_pitch"
                      ? 99
                      : k === "balls"
                        ? 3
                        : 2
                }
                value={draft[k]}
                onChange={(e) =>
                  setDraft({ ...draft, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          {(["us", "them"] as const).map((side) => (
            <label className="nf-label" key={side}>
              {side === "us" ? game.config.teamName : game.config.opponent}{" "}
              score
              <input
                type="number"
                min={0}
                max={999}
                value={draft.score[side]}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    score: { ...draft.score, [side]: Number(e.target.value) },
                  })
                }
              />
            </label>
          ))}
          {(["1", "2", "3"] as const).map((base) => (
            <label className="nf-label" key={base}>
              Runner on base {base}
              <select
                value={draft.bases[base] ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    bases: { ...draft.bases, [base]: e.target.value || null },
                  })
                }
              >
                <option value="">Empty</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {Object.entries(draft.pitchCounts).map(([key, count]) => (
            <label className="nf-label" key={key}>
              {names[key.slice(key.indexOf(":") + 1)] ?? key} pitch total
              <input
                type="number"
                min={0}
                max={999}
                value={count}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pitchCounts: {
                      ...draft.pitchCounts,
                      [key]: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="nf-label">
          Reason for correction
          <input
            maxLength={240}
            value={draft.reason}
            onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
          />
        </label>
      </fieldset>
      {!review ? (
        <button disabled={!draft.reason.trim()} onClick={() => setReview(true)}>
          Preview correction
        </button>
      ) : (
        <div className="nf-notice">
          <h4>Confirm shared changes</h4>
          <p>
            Count {game.balls}–{game.strikes} → {draft.balls}–{draft.strikes};
            outs {game.outs} → {draft.outs}; score {game.score.us}–
            {game.score.them} → {draft.score.us}–{draft.score.them}.
          </p>
          <ul>
            {(["1", "2", "3"] as const).map((b) => (
              <li key={b}>
                Base {b}: {game.bases[b]?.name ?? "empty"} →{" "}
                {players.find((p) => p.id === draft.bases[b])?.name ?? "empty"}
              </li>
            ))}
            {Object.entries(draft.pitchCounts)
              .filter(([k, v]) => game.pitchCounts[k] !== v)
              .map(([k, v]) => (
                <li key={k}>
                  Pitch total {names[k.slice(k.indexOf(":") + 1)] ?? k}:{" "}
                  {game.pitchCounts[k] ?? 0} → {v}
                </li>
              ))}
          </ul>
          <p>{draft.reason}</p>
          <button onClick={() => void onCommand(draft)}>
            Confirm correction for all devices
          </button>
          <button className="nf-secondary" onClick={() => setReview(false)}>
            Keep editing
          </button>
        </div>
      )}
    </div>
  );
}
