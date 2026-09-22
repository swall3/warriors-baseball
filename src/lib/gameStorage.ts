import type { PositionKey } from "@/components/Diamond";

const MASTERY_KEY = "warriors-backup-mastery";
const DAILY_KEY = "warriors-daily-state";

export type MasteryRecord = { correct: number; total: number };
export type MasteryMap = Partial<Record<PositionKey, MasteryRecord>>;

export function getMastery(): MasteryMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(MASTERY_KEY) || "{}");
  } catch {
    return {};
  }
}

export function recordAttempt(zone: PositionKey, correct: boolean) {
  if (typeof window === "undefined") return;
  const mastery = getMastery();
  const rec = mastery[zone] || { correct: 0, total: 0 };
  rec.total += 1;
  if (correct) rec.correct += 1;
  mastery[zone] = rec;
  localStorage.setItem(MASTERY_KEY, JSON.stringify(mastery));
}

// ── Play of the Day ──

function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Deterministic index so every kid sees the same scenario on the same calendar day. */
export function getDailyIndex(scenarioCount: number, date = new Date()): number {
  const seed = Number(dayString(date).replace(/-/g, ""));
  return seed % scenarioCount;
}

export type DailyState = { lastDate: string; streak: number; best: number };

const EMPTY_DAILY: DailyState = { lastDate: "", streak: 0, best: 0 };

export function getDailyState(): DailyState {
  if (typeof window === "undefined") return EMPTY_DAILY;
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    return raw ? JSON.parse(raw) : EMPTY_DAILY;
  } catch {
    return EMPTY_DAILY;
  }
}

function isYesterday(lastDate: string, today: string): boolean {
  if (!lastDate) return false;
  const d = new Date(`${lastDate}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  return Math.round((t.getTime() - d.getTime()) / 86_400_000) === 1;
}

/** Call once when a kid finishes today's Play of the Day. Safe to call multiple times same day. */
export function recordDailyPlay(): { streak: number; best: number; alreadyPlayedToday: boolean } {
  const today = dayString(new Date());
  const state = getDailyState();
  if (state.lastDate === today) {
    return { streak: state.streak, best: state.best, alreadyPlayedToday: true };
  }
  const streak = isYesterday(state.lastDate, today) ? state.streak + 1 : 1;
  const best = Math.max(streak, state.best);
  localStorage.setItem(DAILY_KEY, JSON.stringify({ lastDate: today, streak, best }));
  return { streak, best, alreadyPlayedToday: false };
}

export function hasPlayedToday(): boolean {
  return getDailyState().lastDate === dayString(new Date());
}

// ── Quiz sessions, skill progress & answer streaks (Decision 4) ─────────────
//
// New keys only. `warriors-backup-mastery` (the field-knowledge grid) and
// `warriors-daily-state` (the day-streak chip) keep their exact shape and
// meaning — this is additive alongside them, same "stays on this device"
// promise. Server-persisted training_assignments still record per-scenario
// attempts for the coach; this is the kid-facing encouragement layer on top.

const SESSION_KEY = "warriors-session-progress";

/** Category ids are kept as plain strings here so gameStorage never has to
 *  import the scenario catalog (see sessions.ts for why that matters). */
export type SkillRecord = { correct: number; total: number };

export type SessionProgress = {
  /** Sessions finished per pool key ("backup", "rules", "pos-2b", …). */
  completed: Record<string, number>;
  /** Lifetime sessions finished across every pool. */
  sessionsCompleted: number;
  /** Correct/total per skill category. */
  skills: Record<string, SkillRecord>;
  /** Current run of correct answers, carried across sessions. */
  answerStreak: number;
  /** Best run of correct answers ever. */
  bestAnswerStreak: number;
};

const EMPTY_SESSION_PROGRESS: SessionProgress = {
  completed: {},
  sessionsCompleted: 0,
  skills: {},
  answerStreak: 0,
  bestAnswerStreak: 0,
};

export function getSessionProgress(): SessionProgress {
  if (typeof window === "undefined") return { ...EMPTY_SESSION_PROGRESS };
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return { ...EMPTY_SESSION_PROGRESS };
    const parsed = JSON.parse(raw) as Partial<SessionProgress>;
    return {
      completed: parsed.completed ?? {},
      sessionsCompleted: parsed.sessionsCompleted ?? 0,
      skills: parsed.skills ?? {},
      answerStreak: parsed.answerStreak ?? 0,
      bestAnswerStreak: parsed.bestAnswerStreak ?? 0,
    };
  } catch {
    return { ...EMPTY_SESSION_PROGRESS };
  }
}

function saveSessionProgress(p: SessionProgress) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(p));
  } catch {
    // A full or disabled localStorage must never break the game.
  }
}

/** How many sessions of a given pool this device has finished. */
export function getCompletedSessions(poolKey: string): number {
  return getSessionProgress().completed[poolKey] ?? 0;
}

/**
 * Record one answer. `skill` is the scenario category (or "rules"). Returns
 * the running correct-answer streak so the caller can show it immediately.
 */
export function recordSkillAttempt(skill: string, correct: boolean): number {
  const p = getSessionProgress();
  const rec = p.skills[skill] ?? { correct: 0, total: 0 };
  rec.total += 1;
  if (correct) rec.correct += 1;
  p.skills[skill] = rec;
  p.answerStreak = correct ? p.answerStreak + 1 : 0;
  p.bestAnswerStreak = Math.max(p.bestAnswerStreak, p.answerStreak);
  saveSessionProgress(p);
  return p.answerStreak;
}

/** Call when a kid finishes a session. Advances that pool to the next one. */
export function recordSessionComplete(poolKey: string): SessionProgress {
  const p = getSessionProgress();
  p.completed[poolKey] = (p.completed[poolKey] ?? 0) + 1;
  p.sessionsCompleted += 1;
  saveSessionProgress(p);
  return p;
}
