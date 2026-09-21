"use client";

// /coach/lineup — the defense-by-inning grid (MERGE-PLAN.md Phase 3 + the
// "Lineup builder by inning" row of Phase 4).
//
// Layout is PLAYERS AS ROWS, INNINGS AS COLUMNS. That orientation is the whole
// point: it fits a phone held in portrait in a dugout, and the empty cells are
// the bench-fairness report — you can see at a glance who is sitting and when,
// instead of paging through one inning at a time.
//
// All rules live in @/lib/coach/lineup (pure, no I/O). This file is I/O only:
// localStorage as the write-ahead buffer, opportunistic sync to
// /api/coach/lineup, and the tap targets.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFENSE_GROUP_NAMES, type DefenseGroupName } from "@/lib/coach/defense";
import {
  assignmentFor,
  assignPlayer,
  buildFairness,
  COACH_STORAGE_KEY,
  detectConflicts,
  fieldSpotsForFormat,
  groupForInning,
  LINEUP_PLAN_KEY,
  makeEmptyPlan,
  normalizeFormat,
  normalizeGroups,
  normalizeInningMap,
  normalizePlan,
  PLANNED_INNINGS,
  placementsFor,
  rosterFromPlan,
  setInningGroup,
  sharedGroupInnings,
  BENCH_CONSECUTIVE_LIMIT,
  BENCH_TOTAL_LIMIT,
  type GameFormat,
  type LineupPlan,
} from "@/lib/coach/lineup";
import { fetchLineupPlan, saveLineupPlan } from "@/lib/coach/lineup-sync";

const INNINGS = Array.from({ length: PLANNED_INNINGS }, (_, i) => i + 1);
const SYNC_DEBOUNCE_MS = 1200;

type SyncState = "idle" | "saving" | "saved" | "error" | "local";

// ---------------------------------------------------------------------------
// localStorage I/O
//
// The live-scoring page owns `outlaws-field-app:v1` and rewrites the ENTIRE
// blob on every state change. So we read-modify-write: spread the existing blob
// and overwrite only the three defense keys. A partial write here is the one
// way this page could break live scoring.
// ---------------------------------------------------------------------------

// `fromStorage` is false only when this device has never seen a plan — neither
// key present. That's the signal to adopt the server's copy outright instead of
// offering it, which is what makes "lost the phone" and "opened the laptop"
// actually work.
function readPlanFromStorage(): { plan: LineupPlan; fromStorage: boolean } {
  const meta = (() => {
    try {
      const raw = window.localStorage.getItem(LINEUP_PLAN_KEY);
      return raw ? normalizePlan(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  })();

  const base = meta ?? makeEmptyPlan();

  try {
    const raw = window.localStorage.getItem(COACH_STORAGE_KEY);
    if (!raw) return { plan: base, fromStorage: Boolean(meta) };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const plan: LineupPlan = {
      ...base,
      // The live game blob wins for the defense itself — it is what the coach
      // last touched on the scoring screen.
      format: normalizeFormat(parsed.gameFormat ?? base.format),
      battingOrder: Array.isArray(parsed.outlawsLineup)
        ? (parsed.outlawsLineup as unknown[]).filter((v): v is string => typeof v === "string")
        : base.battingOrder,
      groups: parsed.defenseGroups ? normalizeGroups(parsed.defenseGroups) : base.groups,
      inningMap: parsed.inningDefenseGroup
        ? normalizeInningMap(parsed.inningDefenseGroup)
        : base.inningMap,
    };
    return { plan, fromStorage: true };
  } catch {
    return { plan: base, fromStorage: Boolean(meta) };
  }
}

function writePlanToStorage(plan: LineupPlan) {
  try {
    window.localStorage.setItem(LINEUP_PLAN_KEY, JSON.stringify(plan));
  } catch {
    // Quota/private-mode failures must not break the page.
  }

  try {
    const raw = window.localStorage.getItem(COACH_STORAGE_KEY);
    const existing = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      COACH_STORAGE_KEY,
      JSON.stringify({
        ...existing,
        outlawsLineup: plan.battingOrder,
        defenseGroups: plan.groups,
        inningDefenseGroup: plan.inningMap,
        gameFormat: plan.format,
      }),
    );
  } catch {
    // Same: the in-memory plan is still correct for this session.
  }
}

// ---------------------------------------------------------------------------

export default function LineupBuilderPage() {
  const [plan, setPlan] = useState<LineupPlan | null>(null);
  const [selected, setSelected] = useState<{ player: string; inning: number } | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncError, setSyncError] = useState("");
  const [serverPlan, setServerPlan] = useState<LineupPlan | null>(null);
  const [newPlayer, setNewPlayer] = useState("");
  const [showGroupMap, setShowGroupMap] = useState(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSync = useRef(true);
  const hadLocalPlan = useRef(false);
  const reconciled = useRef(false);

  // Load from localStorage after mount (never during render — the server has no
  // localStorage, and reading it in a state initializer desyncs hydration).
  useEffect(() => {
    const { plan: local, fromStorage } = readPlanFromStorage();
    hadLocalPlan.current = fromStorage;
    setPlan(local);
  }, []);

  // One-shot reconcile with the server copy.
  //
  // Two different outcomes, and the difference matters:
  //   - This device has no local plan at all (new phone, dashboard laptop):
  //     adopt the server copy silently. There is nothing to lose, and this is
  //     the case Phase 3 exists for.
  //   - This device has a local plan: only OFFER the server copy, never take
  //     it. Silent adoption would wipe defense changes made offline on the walk
  //     from the parking lot.
  useEffect(() => {
    if (!plan || reconciled.current) return;
    reconciled.current = true;
    let cancelled = false;

    fetchLineupPlan({ id: plan.id }).then((remote) => {
      if (cancelled || !remote) return;
      if (!hadLocalPlan.current) {
        skipNextSync.current = true;
        setPlan(remote);
        hadLocalPlan.current = true;
        return;
      }
      if (new Date(remote.updatedAt).getTime() > new Date(plan.updatedAt).getTime()) {
        setServerPlan(remote);
      }
    });

    return () => {
      cancelled = true;
    };
    // Runs once, when the local plan first lands. This is a reconcile, not a
    // subscription — re-running per edit would fight the coach's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id]);

  // Persist + sync. localStorage is synchronous and immediate; the network call
  // is debounced and its failure is cosmetic.
  useEffect(() => {
    if (!plan) return;
    writePlanToStorage(plan);

    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }

    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncState("saving");
    syncTimer.current = setTimeout(async () => {
      const result = await saveLineupPlan(plan);
      if (result.ok) {
        setSyncState("saved");
        setSyncError("");
      } else if (result.error === "Offline" || result.error === "Local DB sync disabled") {
        setSyncState("local");
        setSyncError(result.error);
      } else {
        setSyncState("error");
        setSyncError(result.error || "Save failed");
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [plan]);

  const roster = useMemo(() => (plan ? rosterFromPlan(plan) : []), [plan]);
  const conflicts = useMemo(() => (plan ? detectConflicts(plan) : []), [plan]);
  const fairness = useMemo(() => (plan ? buildFairness(plan) : []), [plan]);
  const shared = useMemo(() => (plan ? sharedGroupInnings(plan) : []), [plan]);
  const placements = useMemo(() => (plan ? placementsFor(plan) : []), [plan]);
  const fieldSpots = useMemo(
    () => (plan ? fieldSpotsForFormat(plan.format) : []),
    [plan],
  );

  // Cells involved in a conflict, as "player@inning" keys.
  const conflictCells = useMemo(() => {
    const keys = new Set<string>();
    for (const conflict of conflicts) {
      if (conflict.player) keys.add(`${conflict.player}@${conflict.inning}`);
      if (conflict.spot) {
        for (const placement of placements) {
          if (placement.inning === conflict.inning && placement.spot === conflict.spot) {
            keys.add(`${placement.player}@${placement.inning}`);
          }
        }
      }
    }
    return keys;
  }, [conflicts, placements]);

  const fairnessByPlayer = useMemo(() => {
    const map = new Map<string, (typeof fairness)[number]>();
    for (const row of fairness) map.set(row.player, row);
    return map;
  }, [fairness]);

  const onAssign = useCallback((spot: string | null) => {
    setPlan((prev) => {
      if (!prev || !selected) return prev;
      return assignPlayer(prev, selected.player, selected.inning, spot);
    });
    setSelected(null);
  }, [selected]);

  const onAddPlayer = () => {
    const name = newPlayer.trim();
    if (!name) return;
    setPlan((prev) => {
      if (!prev) return prev;
      if (prev.battingOrder.some((p) => p.trim().toLowerCase() === name.toLowerCase())) return prev;
      return { ...prev, battingOrder: [...prev.battingOrder, name], updatedAt: new Date().toISOString() };
    });
    setNewPlayer("");
  };

  const onSetFormat = (format: GameFormat) => {
    setPlan((prev) => (prev ? { ...prev, format, updatedAt: new Date().toISOString() } : prev));
  };

  const onAdoptServerPlan = () => {
    if (!serverPlan) return;
    // No need to echo the server's own copy straight back at it.
    skipNextSync.current = true;
    setPlan(serverPlan);
    setServerPlan(null);
  };

  // Who already holds each position in the inning being edited — so the picker
  // can say "SS · taken by Jack" instead of silently overwriting him.
  const occupancy = useMemo(() => {
    const map = new Map<string, string>();
    if (!selected) return map;
    for (const placement of placements) {
      if (placement.inning === selected.inning) map.set(placement.spot, placement.player);
    }
    return map;
  }, [placements, selected]);

  if (!plan) {
    return (
      <div className="min-h-screen bg-d-bg p-6 text-d-ink-2">
        <p className="text-sm">Loading lineup…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-d-bg text-d-ink">
      <header className="border-b border-d-sel/40 bg-d-surface p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-d-sel">Lineup Builder</h1>
            <p className="mt-1 text-sm text-d-ink-2">
              Players down, innings across. Tap any cell to set that kid&apos;s position for that inning.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link
              href="/coach"
              className="rounded-lg border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95"
            >
              Back To Scoring
            </Link>
            <Link
              href="/coach/dashboard"
              className="rounded-lg border border-d-sel/40 bg-d-sel/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-sel touch-manipulation active:scale-95"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 pb-40">
        {/* ---- Plan settings ---- */}
        <section className="rounded-xl border border-d-line bg-d-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Plan</h2>
              <input
                className="mt-2 w-56 rounded border border-d-line bg-d-sunken px-2 py-1 text-sm text-d-ink"
                value={plan.label}
                onChange={(e) =>
                  setPlan((prev) => (prev ? { ...prev, label: e.target.value, updatedAt: new Date().toISOString() } : prev))
                }
                aria-label="Plan label"
              />
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Format</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(["coach_pitch", "kid_pitch"] as GameFormat[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onSetFormat(value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide touch-manipulation active:scale-95 ${
                      plan.format === value
                        ? "border-d-sel bg-d-sel text-white"
                        : "border-d-line bg-d-sunken text-d-ink"
                    }`}
                  >
                    {value === "coach_pitch" ? "Coach Pitch" : "Kid Pitch"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-d-ink-3">
                Coach pitch uses LCF/RCF (4 outfielders); kid pitch uses CF (3).
              </p>
            </div>

            <div className="text-right">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Saved</h2>
              <p className="mt-2 text-xs">
                {syncState === "saving" && <span className="text-d-warn">Saving…</span>}
                {syncState === "saved" && <span className="text-d-pos">Synced to database</span>}
                {syncState === "local" && <span className="text-d-ink-3">On this phone only</span>}
                {syncState === "error" && <span className="text-d-neg">On this phone only — sync failed</span>}
                {syncState === "idle" && <span className="text-d-ink-3">On this phone</span>}
              </p>
              <p className="mt-1 max-w-[220px] text-[11px] text-d-ink-3">
                {syncState === "error" ? syncError : "Every change saves locally first. Sync never blocks the game."}
              </p>
            </div>
          </div>

          {serverPlan && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded border border-d-warn/40 bg-d-warn/10 px-3 py-2">
              <span className="text-xs text-d-warn">
                A newer plan for this team is saved on the server (
                {new Date(serverPlan.updatedAt).toLocaleString()}).
              </span>
              <button
                type="button"
                onClick={onAdoptServerPlan}
                className="rounded border border-d-warn/40 bg-d-warn/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-d-warn touch-manipulation active:scale-95"
              >
                Load It
              </button>
            </div>
          )}
        </section>

        {/* ---- Conflicts ---- */}
        {conflicts.length > 0 && (
          <section className="rounded-xl border border-d-neg/40 bg-d-neg/10 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-d-neg">
              {conflicts.length} Conflict{conflicts.length === 1 ? "" : "s"}
            </h2>
            <ul className="mt-2 space-y-1 text-xs text-d-neg">
              {conflicts.map((conflict, idx) => (
                <li key={`conflict-${idx}`}>• {conflict.detail}</li>
              ))}
            </ul>
          </section>
        )}

        {shared.length > 0 && (
          <section className="rounded-xl border border-d-warn/40 bg-d-warn/10 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-d-warn">Shared Rotation Groups</h2>
            <ul className="mt-2 space-y-1 text-xs text-d-warn">
              {shared.map((entry) => (
                <li key={`shared-${entry.group}`}>
                  • Innings {entry.innings.join(", ")} all use group {entry.group} — editing one changes them all.
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---- The grid ---- */}
        <section className="rounded-xl border border-d-line bg-d-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Defense By Inning</h2>
              <p className="mt-1 text-xs text-d-ink-3">
                Blank cell = on the bench that inning. Amber = sitting more than {BENCH_TOTAL_LIMIT} inning or more
                than {BENCH_CONSECUTIVE_LIMIT} in a row.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupMap((v) => !v)}
              className="rounded-lg border border-d-line bg-d-sunken px-3 py-2 text-xs font-semibold uppercase tracking-wide text-d-ink touch-manipulation active:scale-95"
            >
              {showGroupMap ? "Hide" : "Show"} Rotation Groups
            </button>
          </div>

          {showGroupMap && (
            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {INNINGS.map((inning) => (
                <label key={`map-${inning}`} className="flex flex-col gap-1 rounded border border-d-line bg-d-surface p-2 text-xs">
                  <span className="font-semibold text-d-ink-2">Inning {inning}</span>
                  <select
                    className="rounded border border-d-line bg-d-sunken px-2 py-1 text-d-ink"
                    value={groupForInning(plan.inningMap, inning)}
                    onChange={(e) =>
                      setPlan((prev) => (prev ? setInningGroup(prev, inning, e.target.value as DefenseGroupName) : prev))
                    }
                  >
                    {DEFENSE_GROUP_NAMES.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}

          {roster.length === 0 ? (
            <p className="mt-4 rounded border border-d-line bg-d-surface px-3 py-6 text-center text-sm text-d-ink-3">
              No players yet. Add them below, or set the batting order in Game Setup on the scoring screen.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-xs text-d-ink">
                <thead>
                  <tr className="text-d-ink-3">
                    <th className="sticky left-0 z-10 bg-d-sunken py-2 pr-2 text-left">Player</th>
                    {INNINGS.map((inning) => (
                      <th key={`h-${inning}`} className="px-1 py-2 text-center">
                        <div className="font-semibold text-d-ink-2">I{inning}</div>
                        <div className="text-[10px] font-normal text-d-ink-3">
                          {groupForInning(plan.inningMap, inning)}
                        </div>
                      </th>
                    ))}
                    <th className="px-1 py-2 text-center">Fld/Bch</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((player) => {
                    const row = fairnessByPlayer.get(player);
                    const flagged = Boolean(row?.overBenchTotal || row?.overBenchStreak);
                    return (
                      <tr key={`row-${player}`} className="border-t border-d-line">
                        <td
                          className={`sticky left-0 z-10 bg-d-sunken py-1.5 pr-2 font-semibold ${
                            flagged ? "text-d-warn" : "text-d-sel"
                          }`}
                        >
                          {player}
                          {flagged && <span className="ml-1 text-[10px] text-d-warn">●</span>}
                        </td>
                        {INNINGS.map((inning) => {
                          const spot = assignmentFor(plan, player, inning);
                          const isSelected = selected?.player === player && selected?.inning === inning;
                          const hasConflict = conflictCells.has(`${player}@${inning}`);
                          return (
                            <td key={`cell-${player}-${inning}`} className="px-0.5 py-1">
                              <button
                                type="button"
                                onClick={() => setSelected({ player, inning })}
                                aria-label={`${player}, inning ${inning}: ${spot || "bench"}`}
                                className={`h-9 w-full min-w-[42px] rounded border text-[11px] font-bold touch-manipulation active:scale-95 ${
                                  isSelected
                                    ? "border-d-sel bg-d-sel text-white"
                                    : hasConflict
                                      ? "border-d-neg bg-d-neg/10 text-d-neg"
                                      : spot
                                        ? "border-d-pos/40 bg-d-pos/10 text-d-pos"
                                        : "border-d-line bg-d-surface text-d-ink-3"
                                }`}
                              >
                                {spot || "—"}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-1 py-1 text-center tabular-nums">
                          <span className="text-d-pos">{row?.fieldInnings ?? 0}</span>
                          <span className="text-d-ink-3"> / </span>
                          <span className={flagged ? "text-d-warn" : "text-d-ink-3"}>
                            {row?.benchInnings ?? 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="w-44 rounded border border-d-line bg-d-sunken px-2 py-1.5 text-sm text-d-ink"
              placeholder="Add player"
              value={newPlayer}
              onChange={(e) => setNewPlayer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAddPlayer();
                }
              }}
            />
            <button
              type="button"
              onClick={onAddPlayer}
              className="rounded-lg border border-d-pos/40 bg-d-pos/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-d-pos touch-manipulation active:scale-95"
            >
              Add
            </button>
          </div>
        </section>

        {/* ---- Bench fairness detail ---- */}
        <section className="rounded-xl border border-d-line bg-d-surface p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-d-ink-2">Bench Fairness</h2>
          <p className="mt-1 text-xs text-d-ink-3">
            Counted from empty cells, so it covers every kid sitting — not just whoever is in the single BENCH slot.
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {fairness.map((row) => {
              const flagged = row.overBenchTotal || row.overBenchStreak;
              return (
                <li
                  key={`fair-${row.player}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-1.5 ${
                    flagged ? "border-d-warn/40 bg-d-warn/10" : "border-d-line bg-d-surface"
                  }`}
                >
                  <span className={`font-medium ${flagged ? "text-d-warn" : "text-d-ink"}`}>{row.player}</span>
                  <span className="tabular-nums text-d-ink-3">
                    <span className="text-d-pos">{row.fieldInnings}</span> in field /{" "}
                    <span className={row.overBenchTotal ? "text-d-warn" : "text-d-ink-3"}>{row.benchInnings}</span>{" "}
                    benched
                    {row.overBenchStreak && (
                      <span className="ml-2 text-d-neg">{row.longestBenchStreak} in a row</span>
                    )}
                  </span>
                </li>
              );
            })}
            {fairness.length === 0 && <li className="text-d-ink-3">No players on the plan yet.</li>}
          </ul>
        </section>
      </main>

      {/* ---- Position picker ---- */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-d-sel/40 bg-d-surface p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-d-sel">
                {selected.player} · Inning {selected.inning}
                <span className="ml-2 text-[11px] font-normal text-d-ink-3">
                  group {groupForInning(plan.inningMap, selected.inning)}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded border border-d-line bg-d-sunken px-3 py-1 text-xs font-semibold uppercase tracking-wide text-d-ink-2 touch-manipulation active:scale-95"
              >
                Close
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {fieldSpots.map((spot) => {
                const heldBy = occupancy.get(spot.code);
                const isMine = heldBy === selected.player;
                return (
                  <button
                    key={`pick-${spot.code}`}
                    type="button"
                    onClick={() => onAssign(spot.code)}
                    className={`rounded-lg border px-2 py-2 text-xs font-bold touch-manipulation active:scale-95 ${
                      isMine
                        ? "border-d-sel bg-d-sel text-white"
                        : heldBy
                          ? "border-d-warn/40 bg-d-warn/10 text-d-warn"
                          : "border-d-line bg-d-surface text-d-ink"
                    }`}
                  >
                    <div>{spot.code}</div>
                    <div className="mt-0.5 text-[10px] font-normal opacity-80">
                      {heldBy && !isMine ? heldBy : spot.label}
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => onAssign(null)}
                className="rounded-lg border border-d-line bg-d-sunken px-2 py-2 text-xs font-bold text-d-ink touch-manipulation active:scale-95"
              >
                <div>BENCH</div>
                <div className="mt-0.5 text-[10px] font-normal opacity-80">Sit this inning</div>
              </button>
            </div>
            <p className="mt-2 text-[11px] text-d-ink-3">
              Picking a spot someone else holds moves them to the bench for that inning.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
