"use client";

// Kid-facing session encouragement (Decision 4, PRACTICE-ASSIGNMENT-AND-DRILLS).
//
// Reuses the existing visual language: the 🔥 streak chip from the in-game
// header and the percentage tiles from the hub's "Your field knowledge" grid.
// Deliberately absent: any comparison to other players, any red "you're bad at
// this" state, any count of misses. Skills the kid hasn't touched read "New",
// not 0%, exactly like the field-knowledge grid does.
//
// Takes `skillLabels` as a prop rather than importing CATEGORY_LABELS itself —
// this component renders inside client bundles and must not pull anything from
// gameData.ts (PR #16). Same reason sessions.ts is pure math.

import type { SessionPlan } from "@/lib/practice/sessions";
import type { SessionProgress } from "@/lib/gameStorage";

export default function SessionProgressPanel({
  plan,
  progress,
  skillLabels,
  countedThisRound = true,
}: {
  plan: SessionPlan;
  progress: SessionProgress;
  skillLabels: Record<string, string>;
  /** False on a rewind round, which replays old questions and doesn't advance. */
  countedThisRound?: boolean;
}) {
  const skills = Object.keys(skillLabels);
  const started = skills.filter((k) => (progress.skills[k]?.total ?? 0) > 0);

  return (
    <div className="rounded-2xl bg-[#0f2044]/[0.04] border border-[#0f2044]/10 p-4 mb-6 text-left">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="font-display text-[#0f2044] text-[13px] tracking-widest uppercase">
          Your progress
        </p>
        {progress.answerStreak >= 2 && (
          <span className="streak-flame inline-flex items-center gap-1 font-extrabold text-white text-xs rounded-full px-3 py-1">
            🔥 {progress.answerStreak} in a row
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Stat
          value={String(progress.sessionsCompleted)}
          label={
            progress.sessionsCompleted === 1
              ? "session done"
              : "sessions done"
          }
        />
        {plan.count > 1 && (
          <Stat
            value={`${plan.number}/${plan.count}`}
            label={countedThisRound ? "through this set" : "set you replayed"}
          />
        )}
        <Stat value={String(progress.bestAnswerStreak)} label="best streak" />
      </div>

      {started.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {skills.map((key) => {
              const rec = progress.skills[key];
              const pct = rec?.total
                ? Math.round((rec.correct / rec.total) * 100)
                : null;
              return (
                <div
                  key={key}
                  className={`rounded-xl px-3 py-2 ${
                    pct === null
                      ? "bg-white border border-[#0f2044]/10"
                      : pct >= 80
                        ? "bg-green-50 border border-green-200"
                        : "bg-amber-50 border border-amber-200"
                  }`}
                >
                  <p className="text-[#0f2044] font-bold text-[12px] leading-tight">
                    {skillLabels[key]}
                  </p>
                  <p className="text-gray-500 text-[11px] font-semibold">
                    {pct === null ? "New" : `${pct}% · ${rec!.total} reps`}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-gray-400 text-[11px] mt-3">
            Your progress stays on this device.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 min-w-[88px] rounded-xl bg-white border border-[#0f2044]/10 px-3 py-2">
      <p className="font-display text-[#0f2044] text-xl leading-none">{value}</p>
      <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider mt-1">
        {label}
      </p>
    </div>
  );
}
