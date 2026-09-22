"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
import { FIELD_POS, type PositionKey } from "@/components/Diamond";
import {
  getMastery,
  type MasteryMap,
  hasPlayedToday,
  getDailyState,
} from "@/lib/gameStorage";
const positions = Object.keys(FIELD_POS) as PositionKey[];
const activities = [
  {
    href: "rules",
    number: "01",
    title: "Know the rules",
    detail: "Make the call. Build your baseball IQ one question at a time.",
    meta: "15 questions",
    icon: "⚾",
  },
  {
    href: "backup",
    number: "02",
    title: "Back up your team",
    detail: "Read the play and tap the teammate who needs to move.",
    meta: `${BACKUP_SCENARIOS.length} situations`,
    icon: "↗",
  },
  {
    href: "position",
    number: "03",
    title: "Where do I go?",
    detail: "Pick your position. Learn your job before the next pitch.",
    meta: "Practice at your pace",
    icon: "◇",
  },
];
export default function GamesPage() {
  const [mastery, setMastery] = useState<MasteryMap>({});
  const [dailyDone, setDailyDone] = useState(false);
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    setMastery(getMastery());
    setDailyDone(hasPlayedToday());
    setStreak(getDailyState().streak);
  }, []);
  const attempted = positions.filter(
    (p) => (mastery[p]?.total ?? 0) > 0,
  ).length;
  return (
    <main className="training-hub">
      <nav className="training-nav" aria-label="Training navigation">
        <Link href="/" className="training-brand">
          InningWise<span> / TRAINING</span>
        </Link>
        <Link href="/coach/today">Coach workspace ↗</Link>
      </nav>
      <div className="training-content">
        <header className="training-intro">
          <p className="training-eyebrow">Little reps. Big game confidence.</p>
          <h1>
            Your next great
            <br />
            play starts here.
          </h1>
          <p>See the field. Make the call. Be ready for your team.</p>
        </header>
        <Link href="/games/daily" className="training-feature">
          <div>
            <span className="training-kicker">
              {dailyDone ? "TODAY’S REP · COMPLETE" : "TODAY’S REP"}
            </span>
            <h2>
              One play.
              <br />
              Your move.
            </h2>
            <p>
              A fresh situation every day. Read it, find your spot, and keep
              your streak going.
            </p>
            <span className="training-action">
              {dailyDone ? "Review today’s play" : "Play of the day"}{" "}
              <span aria-hidden="true">→</span>
            </span>
          </div>
          <div className="training-diamond" aria-hidden="true">
            <span>⚾</span>
            <i />
            <b>READ THE FIELD</b>
          </div>
          <span className="training-streak">{streak} day streak</span>
        </Link>
        <div className="training-section-title">
          <h2>Find your next rep</h2>
          <span>Choose a skill. Jump in.</span>
        </div>
        <section className="training-activities" aria-label="Training games">
          {activities.map((a) => (
            <Link
              key={a.href}
              href={`/games/${a.href}`}
              className="training-card"
            >
              <div className="training-card-top">
                <span>{a.number} / TRAINING</span>
                <span className="training-card-icon" aria-hidden="true">
                  {a.icon}
                </span>
              </div>
              <h3>{a.title}</h3>
              <p>{a.detail}</p>
              <div className="training-card-bottom">
                <span>{a.meta}</span>
                <span aria-hidden="true">↗</span>
              </div>
            </Link>
          ))}
        </section>
        <section
          className="training-mastery"
          aria-label="Position practice progress"
        >
          <div className="training-section-title">
            <h2>Your field knowledge</h2>
            <span>{attempted} of 9 positions started</span>
          </div>
          <div className="training-positions">
            {positions.map((p) => {
              const rec = mastery[p];
              const pct = rec?.total
                ? Math.round((rec.correct / rec.total) * 100)
                : null;
              return (
                <div
                  key={p}
                  className={
                    pct === null ? "" : pct >= 80 ? "mastered" : "practicing"
                  }
                >
                  <strong>{p}</strong>
                  <span>{pct === null ? "New" : `${pct}%`}</span>
                </div>
              );
            })}
          </div>
          <p>
            Build this as you play Backup Drill and Where Do I Go? Your progress
            stays on this device.
          </p>
        </section>
        <footer className="training-footer">
          <span>Every teammate has a job. Learn yours.</span>
          <Link href="/">Back to InningWise →</Link>
        </footer>
      </div>
    </main>
  );
}
