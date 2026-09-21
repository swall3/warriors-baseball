"use client";
import Link from "next/link";
import { useCoachOrg } from "@/lib/coach/org-client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Workspace, useCatalog, LoadError } from "./Workspace";
import { GamePreparation } from "./GamePreparation";
import { useLiveGame } from "@/lib/coach/live/use-live-game";
import {
  batter,
  battingSide,
  pitchingSide,
  pitchKey,
  fieldPositions,
  type LiveGame,
  type Command,
  type Move,
  type Position,
  type Result,
  type Lane,
} from "@/lib/coach/live/model";
const coordinates: Record<Position, [number, number]> = {
  P: [50, 61],
  C: [50, 89],
  "1B": [76, 65],
  "2B": [66, 43],
  "3B": [24, 65],
  SS: [34, 43],
  LF: [15, 23],
  CF: [50, 16],
  RF: [85, 23],
  LCF: [38, 16],
  RCF: [62, 16],
};
export function LiveField({ game }: { game: LiveGame }) {
  return (
    <div className="nf-field" aria-label="Current defensive positions">
      <div className="nf-infield" />
      {fieldPositions(game.config.format).map((p) => (
        <div
          className="nf-field-player"
          key={p}
          style={{
            left: `${coordinates[p][0]}%`,
            top: `${coordinates[p][1]}%`,
          }}
        >
          <b>{p}</b>
          <span>
            {game.config.roster.find((x) => x.id === game.config.positions[p])
              ?.name ?? "Unassigned"}
          </span>
        </div>
      ))}
    </div>
  );
}
function Score({ game }: { game: LiveGame }) {
  return (
    <div className="nf-score">
      <div>
        <small>{game.config.opponent}</small>
        <strong>{game.score.them}</strong>
      </div>
      <div className="nf-inning">
        <b>
          {game.status === "final"
            ? "FINAL"
            : `${game.half === "top" ? "▲" : "▼"} ${game.inning}`}
        </b>
        <span>{game.outs} outs</span>
      </div>
      <div>
        <small>{game.config.teamName}</small>
        <strong>{game.score.us}</strong>
      </div>
    </div>
  );
}
function Plays({
  game,
  onCommand,
}: {
  game: LiveGame;
  onCommand: (c: Command) => Promise<void>;
}) {
  const [result, setResult] = useState<Result>("single");
  const [zone, setZone] = useState<Position>("LF");
  const [moves, setMoves] = useState<Record<string, Move["to"]>>({});
  const [countRuns, setCountRuns] = useState(false);
  const runners = [
    ...Object.values(game.bases).filter((x) => x !== null),
    ...(game.pending ? [game.pending.batter] : []),
  ];
  const signature =
    runners.map((r) => r.id).join(":") + ":" + (game.pending?.id ?? "");
  useEffect(() => {
    setMoves({});
    setCountRuns(false);
  }, [signature]);
  const destination = (id: string): Move["to"] =>
    moves[id] ??
    (game.pending?.batter.id === id
      ? result === "out"
        ? "out"
        : result === "double"
          ? "2"
          : result === "triple"
            ? "3"
            : result === "home_run"
              ? "home"
              : "1"
      : ((Object.entries(game.bases).find(
          ([, r]) => r?.id === id,
        )?.[0] as Move["to"]) ?? "1"));
  if (!runners.length)
    return (
      <section className="nf-card">
        <h3>Ready for the next play.</h3>
        <p>
          The pitch recorder marks “In play” when the ball is hit. Its result
          appears here for you to finish.
        </p>
      </section>
    );
  return (
    <section className="nf-card">
      <p className="nf-eyebrow">
        {game.pending ? "FINISH THIS PLAY" : "RUNNER ADVANCEMENT"}
      </p>
      <h3>
        {game.pending
          ? `${game.pending.batter.name} put the ball in play.`
          : "Update the runners."}
      </h3>
      {game.pending && (
        <div className="nf-form-grid">
          <label className="nf-label">
            Ball went to
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value as Position)}
            >
              {Object.keys(coordinates).map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="nf-label">
            Result
            <select
              value={result}
              onChange={(e) => setResult(e.target.value as Result)}
            >
              {[
                "single",
                "double",
                "triple",
                "home_run",
                "out",
                "error",
                "fielders_choice",
              ].map((r) => (
                <option key={r} value={r}>
                  {r.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="nf-muted">
        Confirm where every runner ended. The pitch has already been counted.
      </p>
      {runners.map((r) => (
        <label className="nf-runner" key={r.id}>
          <span>{r.name}</span>
          <select
            value={destination(r.id)}
            onChange={(e) =>
              setMoves({ ...moves, [r.id]: e.target.value as Move["to"] })
            }
          >
            {[
              ["out", "Out"],
              ["1", "First"],
              ["2", "Second"],
              ["3", "Third"],
              ["home", "Home"],
            ].map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      ))}
      {game.outs + runners.filter((r) => destination(r.id) === "out").length >=
        3 && (
        <label className="nf-checkbox">
          <input
            type="checkbox"
            checked={countRuns}
            onChange={(e) => setCountRuns(e.target.checked)}
          />
          Count runs scored before the third out (not a force out or batter out
          before first).
        </label>
      )}
      <button
        onClick={() =>
          void onCommand(
            game.pending
              ? {
                  type: "result",
                  pitchId: game.pending.id,
                  result,
                  zone,
                  moves: runners.map((r) => ({
                    id: r.id,
                    to: destination(r.id),
                  })),
                  countRunsOnThirdOut: countRuns,
                }
              : {
                  type: "runners",
                  moves: runners.map((r) => ({
                    id: r.id,
                    to: destination(r.id),
                  })),
                  countRunsOnThirdOut: countRuns,
                },
          )
        }
      >
        Confirm {game.pending ? "play" : "runner movement"}
      </button>
    </section>
  );
}
function Crew({ gameId }: { gameId: string }) {
  const [lane, setLane] = useState<Lane>("pitch");
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [grants, setGrants] = useState<
    {
      id: string;
      label: string;
      lane: Lane;
      revoked: boolean;
      expires_at: string;
    }[]
  >([]);
  const url = `/api/coach/live/${gameId}/crew`;
  useEffect(() => {
    let active = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) setGrants(d.grants);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, version]);
  async function issue() {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lane, label }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setLink(
        `${location.origin}/coach/live/${gameId}${lane === "display" ? "?view=board" : ""}#record=${data.grant.token}`,
      );
      setVersion((v) => v + 1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="nf-card">
      <h3>Give every device a job.</h3>
      <p>
        Recorder links expire after 18 hours and require sign-in to this
        organization. Use viewer access for parents; coach access can manage the
        whole game.
      </p>
      {error && (
        <p role="alert" className="nf-notice">
          {error}
        </p>
      )}
      <div className="nf-form-grid">
        <label className="nf-label">
          Recorder label
          <input
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Parent on first-base side"
          />
        </label>
        <label className="nf-label">
          Role
          <select
            value={lane}
            onChange={(e) => setLane(e.target.value as Lane)}
          >
            <option value="pitch">Pitch recorder</option>
            <option value="play">Play recorder</option>
            <option value="all">All scoring</option>
            <option value="display">Dugout display</option>
          </select>
        </label>
      </div>
      <button onClick={issue}>Create recording link</button>
      {link && (
        <label className="nf-label nf-share">
          Share this link with the assigned recorder
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <small>
            The secret link is shown once. Treat it like a game access pass.
          </small>
        </label>
      )}
      <div className="nf-grants">
        {grants.map((g) => (
          <div key={g.id}>
            <span>
              <strong>{g.label}</strong>
              <small>
                {g.lane} ·{" "}
                {g.revoked
                  ? "Revoked"
                  : new Date(g.expires_at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
              </small>
            </span>
            {!g.revoked && (
              <button
                className="nf-secondary"
                onClick={async () => {
                  try {
                    const r = await fetch(url, {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: g.id }),
                    });
                    if (!r.ok) throw new Error("Unable to revoke assignment.");
                    setVersion((v) => v + 1);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
function CoachControls({
  game,
  onCommand,
}: {
  game: LiveGame;
  onCommand: (c: Command) => Promise<void>;
}) {
  const [pitcher, setPitcher] = useState(game.pitchers.us.id);
  const [opponent, setOpponent] = useState("");
  const [first, setFirst] = useState<Position>("LF");
  const [second, setSecond] = useState<Position>(
    game.config.format === "coach_pitch" ? "LCF" : "CF",
  );
  const [when, setWhen] = useState<"now" | "next">("next");
  const [incoming, setIncoming] = useState(game.config.roster[0].id);
  const planned =
    when === "next"
      ? (game.nextPositions ?? game.config.positions)
      : game.config.positions;
  return (
    <div className="nf-grid">
      <section className="nf-card">
        <h3>Pitchers & counts</h3>
        <p>
          {game.pitchers.us.name}:{" "}
          <b>{game.pitchCounts[pitchKey("us", game.pitchers.us.id)] ?? 0}</b>{" "}
          pitches
        </p>
        {game.config.format === "kid_pitch" && (
          <>
            <label className="nf-label">
              Our next pitcher
              <select
                value={pitcher}
                onChange={(e) => setPitcher(e.target.value)}
              >
                {game.config.roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() =>
                void onCommand({
                  type: "pitcher",
                  side: "us",
                  pitcher: game.config.roster.find((p) => p.id === pitcher)!,
                })
              }
            >
              Change our pitcher
            </button>
          </>
        )}
        <label className="nf-label nf-section">
          Opposing pitcher name or number
          <input
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            maxLength={100}
          />
        </label>
        <button
          className="nf-secondary"
          onClick={() =>
            void onCommand({
              type: "pitcher",
              side: "them",
              pitcher: {
                id: opponent.trim().toLowerCase(),
                name: opponent.trim(),
              },
            })
          }
        >
          Change opposing pitcher
        </button>
        <p className="nf-muted">
          Totals follow each pitcher. Apply your league’s pitch and rest rules;
          no league-specific limit is configured here.
        </p>
      </section>
      <section className="nf-card">
        <h3>Defensive changes</h3>
        <div className="nf-position-inputs">
          {[
            [first, setFirst],
            [second, setSecond],
          ].map(([value, setter], i) => (
            <label className="nf-label" key={i}>
              Position {i + 1}
              <select
                value={value as string}
                onChange={(e) =>
                  (setter as (p: Position) => void)(e.target.value as Position)
                }
              >
                {fieldPositions(game.config.format).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="nf-label nf-section">
          Publish positions
          <select
            value={when}
            onChange={(e) => setWhen(e.target.value as "now" | "next")}
          >
            <option value="next">Next defensive inning</option>
            <option value="now">Now</option>
          </select>
        </label>
        <button
          disabled={first === second || !planned[first] || !planned[second]}
          onClick={() =>
            void onCommand({
              type: "defense",
              when,
              positions: {
                ...planned,
                [first]: planned[second],
                [second]: planned[first],
              },
            })
          }
        >
          Swap positions
        </button>
        <label className="nf-label nf-section">
          Substitute into {first}
          <select
            value={incoming}
            onChange={(e) => setIncoming(e.target.value)}
          >
            {game.config.roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {Object.values(planned).includes(p.id) ? "" : " · bench"}
              </option>
            ))}
          </select>
        </label>
        <button
          className="nf-secondary"
          disabled={planned[first] === incoming}
          onClick={() => {
            const positions = { ...planned };
            const other = Object.entries(positions).find(
              ([, id]) => id === incoming,
            )?.[0] as Position | undefined;
            if (other) positions[other] = positions[first];
            positions[first] = incoming;
            void onCommand({ type: "defense", positions, when });
          }}
        >
          Publish substitution
        </button>
        {game.nextPositions && (
          <p className="nf-notice">
            A position change is scheduled for the next defensive inning.
          </p>
        )}
        <hr />
        <h3>Game control</h3>
        <button
          className="nf-secondary"
          onClick={() => void onCommand({ type: "advance" })}
        >
          Advance half inning
        </button>
        <p className="nf-muted">
          Use for a time/run limit. Three outs advance automatically.
        </p>
        <button onClick={() => void onCommand({ type: "finish" })}>
          Finish game
        </button>
      </section>
    </div>
  );
}
export default function LiveGameScreen({ gameId }: { gameId: string }) {
  const { catalog, error: catalogError, retry } = useCatalog();
  const { orgId } = useCoachOrg();
  const params = useSearchParams();
  const board = params.get("view") === "board";
  const live = useLiveGame(orgId, gameId, board);
  const [tab, setTab] = useState("all");
  const [actionError, setActionError] = useState("");
  const [wake, setWake] = useState(false);
  const game = board || live.conflict ? live.confirmed : live.game;
  const coach = live.lane === "coach";
  const perform = async (command: Command) => {
    try {
      await live.send(command);
      setActionError("");
    } catch (e) {
      setActionError((e as Error).message);
    }
  };
  const notice = (
    <>
      {(live.error || actionError) && (
        <p className="nf-notice" role="alert">
          {actionError || live.error}
        </p>
      )}
      {live.queue.length > 0 && (
        <section className="nf-notice">
          <strong>
            {live.queue.length} action{live.queue.length === 1 ? "" : "s"}{" "}
            awaiting confirmation
          </strong>
          <p>
            {live.conflict
              ? "The shared game changed. Review the current state and your actions before recording again."
              : "Saved on this device. The dugout shows only confirmed changes."}
          </p>
          <details>
            <summary>Review unconfirmed actions</summary>
            <pre>
              {JSON.stringify(
                live.queue.map((p) => p.command),
                null,
                2,
              )}
            </pre>
          </details>
          {!live.conflict && (
            <button onClick={() => void live.retry()}>Retry sync</button>
          )}
          <button
            className="nf-secondary"
            onClick={() =>
              void live.discardQueue().catch((e) => setActionError(e.message))
            }
          >
            Discard unconfirmed actions & reload
          </button>
        </section>
      )}
    </>
  );
  if (board && game)
    return (
      <div className="nf-workspace nf-board">
        <header>
          <strong>{game.config.teamName} dugout</strong>
          <span>
            {live.stale
              ? "Connection lost · last confirmed positions"
              : "Live · read-only display"}
          </span>
          <Link href={`/coach/live/${gameId}`}>Coach view</Link>
        </header>
        <Score game={game} />
        {live.stale && (
          <div className="nf-board-stale" role="status">
            Updates paused. Confirm positions with the coach.
          </div>
        )}
        <div className="nf-board-grid">
          <LiveField game={game} />
          <aside>
            <p className="nf-eyebrow">
              {battingSide(game) === "us" ? "AT BAT" : "NEXT UP FOR US"}
            </p>
            <h2>
              {
                game.config.roster.find(
                  (p) =>
                    p.id ===
                    game.config.order[
                      game.battingIndex.us % game.config.order.length
                    ],
                )?.name
              }
            </h2>
            <h3>Batting order</h3>
            <ol>
              {game.config.order.map((id) => (
                <li key={id}>
                  {game.config.roster.find((p) => p.id === id)?.name}
                </li>
              ))}
            </ol>
            <p>
              <b>Bench:</b>{" "}
              {game.config.roster
                .filter(
                  (p) => !Object.values(game.config.positions).includes(p.id),
                )
                .map((p) => p.name)
                .join(", ") || "None"}
            </p>
            <p>
              <b>{game.pitchers.us.name}:</b>{" "}
              {game.pitchCounts[pitchKey("us", game.pitchers.us.id)] ?? 0}{" "}
              pitches
            </p>
          </aside>
        </div>
        <footer>
          <span>
            Last checked{" "}
            {live.lastSeen ? new Date(live.lastSeen).toLocaleTimeString() : "—"}
          </span>
          <button
            onClick={async () => {
              try {
                if (!("wakeLock" in navigator))
                  throw new Error(
                    "Keep this device awake in its display settings.",
                  );
                const lock = await navigator.wakeLock.request("screen");
                setWake(true);
                lock.addEventListener("release", () => setWake(false));
              } catch (e) {
                setActionError((e as Error).message);
              }
            }}
          >
            {wake ? "Screen awake" : "Keep screen awake"}
          </button>
          {actionError && <span role="status">{actionError}</span>}
        </footer>
      </div>
    );
  return (
    <Workspace catalog={catalog} active="Games">
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      <section className="nf-intro">
        <p className="nf-eyebrow">{game?.status ?? "LOADING GAME"}</p>
        <h2>
          {game
            ? `${game.config.teamName} vs ${game.config.opponent}`
            : "Opening your game…"}
        </h2>
        {game && (
          <Link href={`/coach/live/${gameId}?view=board`} target="_blank">
            Open dugout display ↗
          </Link>
        )}
      </section>
      {notice}
      {game && !live.recordingAllowed && live.lane !== "display" && (
        <p className="nf-notice">
          This tab is read-only while another tab records this role. Close the
          other recording tab and reload here to take over. Recording requires a
          browser with Web Locks support.
        </p>
      )}
      {game && (
        <>
          <Score game={game} />
          <div className="nf-sync" role="status">
            {live.stale
              ? "Offline / stale"
              : live.queue.length
                ? "Confirming changes…"
                : "Up to date"}{" "}
            · {live.lane === "coach" ? "Coach" : `${live.lane} role`}
          </div>
          {game.status === "ready" ? (
            <>
              <div className="nf-steps">
                <button onClick={() => setTab("all")}>Preparation</button>
                {coach && (
                  <button onClick={() => setTab("crew")}>Crew & devices</button>
                )}
              </div>
              {coach && tab === "crew" ? (
                <Crew gameId={gameId} />
              ) : coach && catalog ? (
                <GamePreparation
                  catalog={catalog}
                  initial={game.config}
                  busy={live.queue.length > 0}
                  onSave={async (config) => {
                    await live.send({ type: "configure", config });
                    setActionError("");
                  }}
                />
              ) : (
                <p className="nf-card">
                  The coach is preparing this game. Your recording controls will
                  appear when it starts.
                </p>
              )}
              {coach && (
                <button
                  disabled={
                    live.queue.length > 0 ||
                    live.conflict ||
                    !live.recordingAllowed
                  }
                  onClick={() => void perform({ type: "start" })}
                >
                  Start game
                </button>
              )}
            </>
          ) : game.status === "final" ? (
            <section className="nf-card">
              <h3>That’s a wrap.</h3>
              <p>Review the game to choose what to practice next.</p>
              <Link
                className="nf-button"
                href={`/coach/live/${gameId}/insights`}
              >
                Review game insights →
              </Link>
            </section>
          ) : (
            <>
              <div className="nf-steps">
                {(coach
                  ? ["all", "pitch", "play", "coach", "crew"]
                  : live.lane === "all"
                    ? ["all"]
                    : [live.lane]
                ).map((t) => (
                  <button
                    key={t}
                    aria-current={tab === t ? "page" : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t === "all"
                      ? "All scoring"
                      : t === "pitch"
                        ? "Pitches"
                        : t === "play"
                          ? "Plays"
                          : t === "coach"
                            ? "Coach"
                            : "Crew & devices"}
                  </button>
                ))}
              </div>
              <fieldset
                disabled={live.conflict || !live.recordingAllowed}
                className="nf-controls"
              >
                {coach && tab === "crew" ? (
                  <Crew gameId={gameId} />
                ) : coach && tab === "coach" ? (
                  <CoachControls game={game} onCommand={perform} />
                ) : live.lane === "display" ? (
                  <p className="nf-card">
                    Read-only access. Use your assigned recorder link to record
                    pitches or plays.
                  </p>
                ) : (
                  <div className="nf-grid">
                    {(live.lane === "pitch" ||
                      live.lane === "all" ||
                      (coach && (tab === "all" || tab === "pitch"))) && (
                      <section className="nf-card">
                        <p className="nf-eyebrow">
                          AT BAT ·{" "}
                          {battingSide(game) === "us"
                            ? game.config.teamName
                            : game.config.opponent}
                        </p>
                        <h3>{batter(game).name}</h3>
                        <div className="nf-count">
                          <b>
                            {game.balls}–{game.strikes}
                          </b>
                          <span>balls – strikes</span>
                        </div>
                        <p>
                          {game.pitchers[pitchingSide(game)].name} ·{" "}
                          <b>
                            {game.pitchCounts[
                              pitchKey(
                                pitchingSide(game),
                                game.pitchers[pitchingSide(game)].id,
                              )
                            ] ?? 0}
                          </b>{" "}
                          pitches
                        </p>
                        <div className="nf-pitch-buttons">
                          {(
                            [
                              ["ball", "Ball"],
                              ["called_strike", "Called strike"],
                              ["swinging_strike", "Swinging strike"],
                              ["foul", "Foul"],
                              ["in_play", "In play"],
                            ] as const
                          ).map(([outcome, label]) => (
                            <button
                              key={outcome}
                              disabled={!!game.pending}
                              onClick={() =>
                                void perform({ type: "pitch", outcome })
                              }
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {game.config.format==="coach_pitch" && <div className="nf-section"><p className="nf-muted">Coach-pitch counts are informational. End the at-bat according to your league’s rules; these buttons do not add a pitch.</p><button className="nf-secondary" disabled={!!game.pending} onClick={()=>void perform({type:"end_at_bat",outcome:"strikeout"})}>Batter out on strikes</button><button className="nf-secondary" disabled={!!game.pending} onClick={()=>void perform({type:"end_at_bat",outcome:"walk"})}>Award first base</button></div>}
                        {game.pending && (
                          <p className="nf-notice">
                            Pitch counted. Waiting for the play result.
                          </p>
                        )}
                      </section>
                    )}
                    {(live.lane === "play" ||
                      live.lane === "all" ||
                      (coach && (tab === "all" || tab === "play"))) && (
                      <Plays game={game} onCommand={perform} />
                    )}
                  </div>
                )}
              </fieldset>
            </>
          )}
          {coach && game.undo && (
            <button
              className="nf-secondary nf-section"
              disabled={live.conflict || !live.recordingAllowed}
              onClick={() =>
                void perform({ type: "undo", targetId: game.undo!.id })
              }
            >
              Undo last action: {game.undo.label}
            </button>
          )}
        </>
      )}
    </Workspace>
  );
}
