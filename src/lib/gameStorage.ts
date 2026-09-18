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
