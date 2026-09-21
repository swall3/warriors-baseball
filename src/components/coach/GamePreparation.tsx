"use client";
import { useState } from "react";
import type { Catalog } from "./Workspace";
import {
  fieldPositions,
  validateConfig,
  validateDefense,
  type Config,
  type Position,
} from "@/lib/coach/live/model";
export function GamePreparation({
  catalog,
  initial,
  onSave,
  busy,
}: {
  catalog: Catalog;
  initial?: Config;
  onSave: (config: Config) => Promise<void>;
  busy: boolean;
}) {
  const teams = catalog.teams.filter((t) =>
    catalog.players.some((p) => p.team_id === t.id),
  );
  function makeConfig(teamId: string): Config {
    const roster = catalog.players
      .filter((p) => p.team_id === teamId)
      .map((p) => ({ id: p.id, name: p.display_name }));
    return {
      teamId,
      teamName: catalog.teams.find((t) => t.id === teamId)?.name ?? "",
      opponent: "",
      date: new Date().toLocaleDateString("en-CA"),
      usAreHome: true,
      format: "kid_pitch",
      innings: 6,
      roster,
      order: roster.map((p) => p.id),
      opponentOrder: Array.from({ length: 9 }, (_, i) => ({
        id: `opponent-${i + 1}`,
        name: `Batter ${i + 1}`,
      })),
      positions: Object.fromEntries(
        fieldPositions("kid_pitch")
          .slice(0, roster.length)
          .map((p, i) => [p, roster[i].id]),
      ),
      crewMode: "split",
    };
  }
  const [config, setConfig] = useState<Config>(
    () => initial ?? makeConfig(teams[0]?.id ?? ""),
  );
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const update = (patch: Partial<Config>) =>
    setConfig((c) => ({ ...c, ...patch }));
  function assign(position: Position, id: string) {
    const positions = { ...config.positions };
    const other = Object.entries(positions).find(
      ([p, v]) => p !== position && v === id,
    )?.[0] as Position | undefined;
    if (other) {
      const old = positions[position];
      if (old) positions[other] = old;
      else delete positions[other];
    }
    if (id) positions[position] = id;
    else delete positions[position];
    update({ positions });
  }
  async function save() {
    try {
      validateConfig(config);
      validateDefense(config.positions, config, true);
      setError("");
      await onSave(config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare this game.");
    }
  }
  return (
    <>
      <div className="nf-steps" aria-label="Preparation steps">
        {["Game & lineup", "Recording crew", "Ready check"].map((label, i) => (
          <button
            key={label}
            onClick={() => setStep(i)}
            aria-current={step === i ? "step" : undefined}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="nf-notice">
          {error}
        </p>
      )}
      {!teams.length && (
        <p className="nf-notice">
          An active roster is required before preparing a game.
        </p>
      )}
      {step === 0 && (
        <>
          <section className="nf-card nf-form-grid">
            <label className="nf-label">
              Team
              <select
                disabled={!!initial}
                value={config.teamId}
                onChange={(e) => setConfig(makeConfig(e.target.value))}
              >
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="nf-label">
              Opponent
              <input
                value={config.opponent}
                maxLength={120}
                onChange={(e) => update({ opponent: e.target.value })}
                placeholder="Opponent team name"
              />
            </label>
            <label className="nf-label">
              Game date
              <input
                type="date"
                value={config.date}
                onChange={(e) => update({ date: e.target.value })}
              />
            </label>
            <label className="nf-label">
              We are
              <select
                value={config.usAreHome ? "home" : "away"}
                onChange={(e) =>
                  update({ usAreHome: e.target.value === "home" })
                }
              >
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </label>
            <label className="nf-label">
              Format
              <select
                value={config.format}
                onChange={(e) => {
                  const format = e.target.value as Config["format"];
                  update({
                    format,
                    positions: Object.fromEntries(
                      fieldPositions(format)
                        .slice(0, config.roster.length)
                        .map((p, i) => [p, config.roster[i].id]),
                    ),
                  });
                }}
              >
                <option value="kid_pitch">Kid pitch · 9 fielders</option>
                <option value="coach_pitch">Coach pitch · 10 fielders</option>
              </select>
            </label>
            <label className="nf-label">
              Planned innings
              <input
                type="number"
                min={1}
                max={20}
                value={config.innings}
                onChange={(e) => update({ innings: Number(e.target.value) })}
              />
            </label>
          </section>
          <div className="nf-grid nf-section">
            <section className="nf-card">
              <h3>Batting order</h3>
              <p className="nf-muted">
                Everyone bats. Move players into the order you want.
              </p>
              <ol className="nf-order">
                {config.order.map((id, i) => (
                  <li key={id}>
                    <span>
                      {i + 1}. {config.roster.find((p) => p.id === id)?.name}
                    </span>
                    <button
                      aria-label={`Move ${config.roster.find((p) => p.id === id)?.name} up`}
                      disabled={i === 0}
                      onClick={() => {
                        const order = [...config.order];
                        [order[i - 1], order[i]] = [order[i], order[i - 1]];
                        update({ order });
                      }}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${config.roster.find((p) => p.id === id)?.name} down`}
                      disabled={i === config.order.length - 1}
                      onClick={() => {
                        const order = [...config.order];
                        [order[i + 1], order[i]] = [order[i], order[i + 1]];
                        update({ order });
                      }}
                    >
                      ↓
                    </button>
                  </li>
                ))}
              </ol>
            </section>
            <section className="nf-card">
              <h3>First-inning defense</h3>
              <p className="nf-muted">
                Choosing an assigned player swaps their positions.
              </p>
              <div className="nf-position-inputs">
                {fieldPositions(config.format).map((p) => (
                  <label className="nf-label" key={p}>
                    {p}
                    <select
                      value={config.positions[p] ?? ""}
                      onChange={(e) => assign(p, e.target.value)}
                    >
                      <option value="">Choose player</option>
                      {config.roster.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <p>
                Bench:{" "}
                {config.roster
                  .filter(
                    (p) => !Object.values(config.positions).includes(p.id),
                  )
                  .map((p) => p.name)
                  .join(", ") || "None"}
              </p>
            </section>
          </div>
          <section className="nf-card">
            <h3>Opponent batting order</h3>
            <p className="nf-muted">
              Use names or jersey numbers when available. Numbered placeholders
              keep the order moving until you know them.
            </p>
            <label className="nf-label">
              Batters
              <input
                type="number"
                min={1}
                max={30}
                value={config.opponentOrder.length}
                onChange={(e) => {
                  const count = Math.min(
                    30,
                    Math.max(1, Number(e.target.value)),
                  );
                  update({
                    opponentOrder: Array.from(
                      { length: count },
                      (_, i) =>
                        config.opponentOrder[i] ?? {
                          id: `opponent-${i + 1}`,
                          name: `Batter ${i + 1}`,
                        },
                    ),
                  });
                }}
              />
            </label>
            <div className="nf-form-grid">
              {config.opponentOrder.map((p, i) => (
                <label className="nf-label" key={p.id}>
                  Batter {i + 1}
                  <input
                    value={p.name}
                    maxLength={120}
                    onChange={(e) =>
                      update({
                        opponentOrder: config.opponentOrder.map((x, j) =>
                          j === i ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </section>
        </>
      )}
      {step === 1 && (
        <section className="nf-card">
          <p className="nf-eyebrow">PHONES FOR RECORDING · IPAD FOR DISPLAY</p>
          <h3>How will you record the game?</h3>
          <div className="nf-choice-grid">
            {(
              [
                [
                  "combined",
                  "One person records everything",
                  "Pitches and play results on one phone.",
                ],
                [
                  "split",
                  "Two people share the job",
                  "One records each pitch; the other finishes plays.",
                ],
              ] as const
            ).map(([value, title, description]) => (
              <button
                className="nf-choice"
                aria-pressed={config.crewMode === value}
                key={value}
                onClick={() => update({ crewMode: value })}
              >
                <strong>{title}</strong>
                <span>{description}</span>
              </button>
            ))}
          </div>
          <p>
            After saving, create a recorder link for each role. A separate
            read-only link works on the dugout iPad.
          </p>
          <p className="nf-muted">
            Links require sign-in to this organization. Use viewer access for
            parents who should only record their assigned role.
          </p>
        </section>
      )}
      {step === 2 && (
        <section className="nf-card">
          <p className="nf-eyebrow">READY CHECK</p>
          <h3>
            {config.teamName} vs {config.opponent || "Choose opponent"}
          </h3>
          <p>
            {config.date} · {config.usAreHome ? "Home" : "Away"} ·{" "}
            {config.format === "kid_pitch" ? "Kid pitch" : "Coach pitch"} ·{" "}
            {config.innings} innings
          </p>
          <ul className="nf-checks">
            <li>{config.order.length} players in batting order</li>
            <li>
              {Object.keys(config.positions).length} defensive assignments
            </li>
            <li>
              {config.crewMode === "split"
                ? "Separate pitch and play recorders"
                : "One recorder for pitches and plays"}
            </li>
            <li>Pitch totals start at zero and follow each pitcher</li>
          </ul>
          <p className="nf-muted">
            Saving creates the game. Start it from the game screen when both
            teams are ready.
          </p>
          <button disabled={busy || !teams.length} onClick={save}>
            {busy
              ? "Saving…"
              : initial
                ? "Save preparation"
                : "Save game & set up devices"}
          </button>
        </section>
      )}
      <div className="nf-step-actions">
        {step > 0 && (
          <button className="nf-secondary" onClick={() => setStep(step - 1)}>
            Back
          </button>
        )}
        {step < 2 && (
          <button onClick={() => setStep(step + 1)}>Continue →</button>
        )}
      </div>
    </>
  );
}
