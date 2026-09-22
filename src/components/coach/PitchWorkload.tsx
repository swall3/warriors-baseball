"use client";
import { useEffect, useState } from "react";
import type { Config, LiveGame } from "@/lib/coach/live/model";
import {
  pitchingAvailability,
  type Outing,
  type PitchRules,
} from "@/lib/coach/live/pitch-rules";
export function PitchRuleEditor({
  config,
  onChange,
}: {
  config: Config;
  onChange: (rules: PitchRules | undefined) => void;
}) {
  const rules = config.pitchRules;
  return (
    <section className="nf-card">
      <h3>League pitch rules</h3>
      <p>
        Enter the rules your league uses for this roster. These are coach
        reminders, not automatic permission to pitch.
      </p>
      <label className="nf-label">
        <span>
          <input
            type="checkbox"
            checked={!!rules}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? { name: "My league", dailyLimit: 75, warnAt: 65, rest: [] }
                  : undefined,
              )
            }
          />{" "}
          Configure limits for this game
        </span>
      </label>
      {rules && (
        <>
          <p className="nf-notice">
            Example values only. Confirm the daily limit and add every rest
            threshold before saving.
          </p>
          <div className="nf-form-grid">
            <label className="nf-label">
              Rule name
              <input
                value={rules.name}
                maxLength={80}
                onChange={(e) => onChange({ ...rules, name: e.target.value })}
              />
            </label>
            <label className="nf-label">
              Daily pitch limit
              <input
                type="number"
                min={1}
                max={200}
                value={rules.dailyLimit}
                onChange={(e) =>
                  onChange({ ...rules, dailyLimit: Number(e.target.value) })
                }
              />
            </label>
            <label className="nf-label">
              Warn at
              <input
                type="number"
                min={1}
                max={rules.dailyLimit}
                value={rules.warnAt}
                onChange={(e) =>
                  onChange({ ...rules, warnAt: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <p>
            Each threshold means “more than this many pitches requires this many
            full calendar days off.” Enter thresholds in increasing order.
          </p>
          {rules.rest.map((tier, i) => (
            <div className="nf-form-grid" key={i}>
              <label className="nf-label">
                More than pitches — tier {i + 1}
                <input
                  type="number"
                  min={0}
                  max={199}
                  value={tier.above}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      rest: rules.rest.map((t, j) =>
                        j === i ? { ...t, above: Number(e.target.value) } : t,
                      ),
                    })
                  }
                />
              </label>
              <label className="nf-label">
                Rest days — tier {i + 1}
                <input
                  type="number"
                  min={0}
                  max={14}
                  value={tier.days}
                  onChange={(e) =>
                    onChange({
                      ...rules,
                      rest: rules.rest.map((t, j) =>
                        j === i ? { ...t, days: Number(e.target.value) } : t,
                      ),
                    })
                  }
                />
              </label>
              <button
                className="nf-secondary"
                onClick={() =>
                  onChange({
                    ...rules,
                    rest: rules.rest.filter((_, j) => j !== i),
                  })
                }
              >
                Remove tier {i + 1}
              </button>
            </div>
          ))}
          <button
            className="nf-secondary"
            disabled={rules.rest.length >= 10}
            onClick={() =>
              onChange({
                ...rules,
                rest: [
                  ...rules.rest,
                  {
                    above: (rules.rest.at(-1)?.above ?? 0) + 20,
                    days: (rules.rest.at(-1)?.days ?? 0) + 1,
                  },
                ],
              })
            }
          >
            Add rest threshold
          </button>
        </>
      )}
    </section>
  );
}
export function PitchWorkload({
  config,
  game,
  compact = false,
}: {
  config: Config;
  game?: LiveGame;
  compact?: boolean;
}) {
  const [outings, setOutings] = useState<Outing[] | null>(null),
    [error, setError] = useState("");
  const enabled = config.format === "kid_pitch" && !!config.pitchRules;
  const gameId = game?.id;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const q = new URLSearchParams({
          date: config.date,
          ...(gameId ? { exclude: gameId } : {}),
        });
        const r = await fetch(`/api/coach/workload?${q}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (active) {
          setOutings(d.outings);
          setError("");
        }
      } catch (e) {
        if (active && !controller.signal.aborted) {
          setOutings(null);
          setError((e as Error).message);
        }
      }
    };
    setOutings(null);
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [config.date, gameId, enabled]);
  if (config.format !== "kid_pitch") return null;
  const rules = config.pitchRules;
  if (compact && rules && game) {
    const a = outings
      ? pitchingAvailability(
          game.pitchers.us.id,
          config.date,
          rules,
          outings,
          game.pitchCounts[`us:${game.pitchers.us.id}`] ?? 0,
        )
      : null;
    return (
      <aside className="nf-pitch-readiness" aria-label="Pitcher workload">
        <strong>
          {game.pitchers.us.name}:{" "}
          {a ? `${a.today}/${rules.dailyLimit} today` : "workload unverified"}
        </strong>
        <p>
          {a
            ? a.resting
              ? `Rest until ${a.availableOn}`
              : a.atLimit
                ? "Daily limit reached"
                : a.warning
                  ? `Near daily limit · ${a.remaining} left`
                  : `${a.remaining} pitches left under ${rules.name}`
            : error || "Checking recorded workload…"}
        </p>
        <details>
          <summary>Limits and rest details</summary>
          <p>
            {rules.rest.length
              ? a
                ? `${a.restDays} full rest days required after today's recorded workload.`
                : "Rest eligibility unverified."
              : "No rest thresholds configured."}{" "}
            Confirm outside games, other roster identities, catcher rules and
            league exceptions with the coach. This includes only shared games
            recorded here in the last 15 days. Warnings do not stop recording.
          </p>
        </details>
      </aside>
    );
  }
  return (
    <section className="nf-card">
      <h3>
        {compact ? "Current pitcher · limits & rest" : "Pitcher readiness"}
      </h3>
      {!rules ? (
        <p>
          No league limits configured. Set them during preparation and confirm
          rest with each family.
        </p>
      ) : (
        <>
          <p>
            {rules.name} · {rules.dailyLimit} pitches per day · warning at{" "}
            {rules.warnAt}
          </p>
          {!rules.rest.length && (
            <p className="nf-notice">
              No rest thresholds configured. Rest eligibility cannot be
              determined.
            </p>
          )}
          {!outings ? (
            <p role="status">
              {error || "Checking recorded workload…"} Eligibility is
              unverified.
            </p>
          ) : (
            <div className="nf-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Today</th>
                    <th>Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {config.roster
                    .filter((p) => !compact || p.id === game?.pitchers.us.id)
                    .map((p) => {
                      const a = pitchingAvailability(
                        p.id,
                        config.date,
                        rules,
                        outings,
                        game?.pitchCounts[`us:${p.id}`] ?? 0,
                      );
                      return (
                        <tr key={p.id}>
                          <td>
                            {p.name}
                            {config.positions.P === p.id ? " · P" : ""}
                          </td>
                          <td>
                            {a.today} / {rules.dailyLimit}
                          </td>
                          <td>
                            {a.resting
                              ? `Rest until ${a.availableOn}`
                              : a.atLimit
                                ? "Daily limit reached"
                                : a.warning
                                  ? `Near limit · ${a.remaining} left`
                                  : rules.rest.length
                                    ? `${a.remaining} left · no recorded rest restriction`
                                    : "Confirm rest with coach"}
                            {a.today > 0 && rules.rest.length > 0
                              ? ` · ${a.restDays} full rest days after today`
                              : ""}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="nf-muted">
        Includes shared kid-pitch games recorded here in the last 15 days.
        Outside games, imported games, player identities on other rosters,
        catcher restrictions and special exceptions need coach confirmation.
        Counts still record pitches after a warning.
      </p>
    </section>
  );
}
