"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import InstallPrompt from "@/components/InstallPrompt";
import { setGameProgressPlayer } from "@/lib/gameStorage";
type Game = { id: string; date: string; opponent: string; status: string };
type Stats = {
  gamesPlayed: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  average: string;
} | null;
type GameProgress = {
  game_key: string;
  correct: number;
  total: number;
  streak: number | null;
  best_streak: number | null;
};
type Data = {
  games: Game[];
  upcoming: Game[];
  stats: Stats;
  gameProgress: GameProgress[];
  practice: {
    id: string;
    player_id: string;
    scenario_id: string;
    note: string;
    // Server-resolved display text (no answer pool in the client bundle).
    scenario_label?: string | null;
    scenario_question?: string | null;
  }[];
  players: { id: string; display_name: string }[];
  linkedPlayers: { id: string; teamId: string; displayName: string }[];
  selectedPlayerId: string | null;
};
// Friendly labels for the learning-game keys stored in game_progress.
const GAME_LABELS: Record<string, string> = {
  rules: "Rules",
  backup: "Backup positions",
  position: "Position practice",
  daily: "Play of the day",
};
function gameLabel(key: string): string {
  return GAME_LABELS[key] ?? key.replace(/[-_]/g, " ");
}
// Decision 5 (PRACTICE-ASSIGNMENT-AND-DRILLS.md): the last kid a parent
// switched to is remembered per device (localStorage, not a cookie/account
// setting) so a shared family device doesn't push one parent's selection
// onto another signed-in parent. Namespaced by user+org so switching
// accounts or organizations never leaks a stale selection.
function switcherKey(userId: string, orgId: string) {
  return `iw_family_kid:${orgId}:${userId}`;
}
export default function Family() {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Record<string, string>>({}),
    [selected, setSelected] = useState<string | null>(null),
    [session, setSession] = useState<{ userId: string; orgId: string } | null>(
      null,
    );
  const load = useCallback((playerId?: string | null) => {
    const c = new AbortController();
    const url = playerId
      ? `/api/coach/family?player=${encodeURIComponent(playerId)}`
      : "/api/coach/family";
    fetch(url, { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          // A remembered kid can go stale (removed/reassigned since the last
          // visit). Don't get stuck on a 403 — fall back to the unfiltered,
          // all-linked-kids view rather than showing a dead end.
          if (r.status === 403 && playerId) {
            const retry = await fetch("/api/coach/family", {
              signal: c.signal,
              cache: "no-store",
            });
            const rd = await retry.json();
            if (retry.ok) {
              setData(rd);
              setSelected(rd.selectedPlayerId ?? null);
              return;
            }
          }
          throw new Error(d.error);
        }
        setData(d);
        setSelected(d.selectedPlayerId ?? null);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return c;
  }, []);
  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.user && d.selected)
          setSession({ userId: d.user.id, orgId: d.selected });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    let remembered: string | null = null;
    if (session)
      try {
        remembered = localStorage.getItem(
          switcherKey(session.userId, session.orgId),
        );
      } catch {
        /* private-browsing/storage-disabled: fall back to unscoped view */
      }
    const c = load(remembered);
    return () => c.abort();
  }, [load, session]);
  function switchKid(playerId: string | null) {
    setError("");
    setResult({});
    // Keep the /games progress context in lockstep with the family selection,
    // so learning-game progress can never be attributed to the previously
    // selected kid on a shared device. Cleared on "All players".
    setGameProgressPlayer(playerId);
    if (session)
      try {
        const key = switcherKey(session.userId, session.orgId);
        if (playerId) localStorage.setItem(key, playerId);
        else localStorage.removeItem(key);
      } catch {
        /* ignore — selection just won't persist across reloads */
      }
    load(playerId);
  }
  async function answer(id: string, position: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/coach/training/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: crypto.randomUUID(), answer: position }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult((x) => ({ ...x, [id]: d.explanation }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }

  const linked = data?.linkedPlayers ?? [];
  const selectedPlayer = selected
    ? linked.find((p) => p.id === selected)
    : null;
  // Landing view: more than one kid and none chosen yet → let the parent pick.
  const showPicker = !!data && linked.length > 1 && !selected;

  return (
    <div className="nf-workspace">
      <main className="nf-main">
        <header className="nf-top">
          <Link href="/" className="nf-wordmark">
            InningWise
          </Link>
          <div className="nf-top-right">
            <span>Family view</span>
            <Link href="/install#parents" className="nf-account-link">Install</Link>
            <Link href="/account" className="nf-account-link">
              Account
            </Link>
          </div>
        </header>
        <InstallPrompt />

        {error && (
          <p role="alert" className="nf-notice">
            {error}
          </p>
        )}

        {showPicker ? (
          <section className="nf-card">
            <p className="nf-eyebrow">FAMILY VIEW</p>
            <h1>Your players</h1>
            <p>Choose a player to see their games, practice, and progress.</p>
            <nav aria-label="Choose a player" className="nf-kid-cards">
              {linked.map((p) => (
                <button
                  key={p.id}
                  className="nf-kid-card"
                  disabled={busy}
                  onClick={() => switchKid(p.id)}
                >
                  <span className="nf-kid-badge">
                    {p.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="nf-kid-name">{p.displayName}</span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </nav>
          </section>
        ) : (
          <section className="nf-card">
            {linked.length > 1 && (
              <button
                className="nf-back-link"
                onClick={() => switchKid(null)}
                disabled={busy}
              >
                ← All my players
              </button>
            )}
            <p className="nf-eyebrow">FAMILY VIEW</p>
            <h1>
              {selectedPlayer?.displayName ??
                (linked.length === 1 ? linked[0]?.displayName : "Your players")}
            </h1>
            <p>Game updates and coach-assigned practice, in one place.</p>

            {data?.stats && (
              <>
                <h2>Batting</h2>
                {data.stats.atBats > 0 ? (
                  <dl className="nf-stat-line">
                    <div>
                      <dt>AVG</dt>
                      <dd>{data.stats.average}</dd>
                    </div>
                    <div>
                      <dt>Games</dt>
                      <dd>{data.stats.gamesPlayed}</dd>
                    </div>
                    <div>
                      <dt>At-bats</dt>
                      <dd>{data.stats.atBats}</dd>
                    </div>
                    <div>
                      <dt>Hits</dt>
                      <dd>{data.stats.hits}</dd>
                    </div>
                    <div>
                      <dt>2B</dt>
                      <dd>{data.stats.doubles}</dd>
                    </div>
                    <div>
                      <dt>3B</dt>
                      <dd>{data.stats.triples}</dd>
                    </div>
                  </dl>
                ) : (
                  <p>Stats will appear here after their first recorded game.</p>
                )}
              </>
            )}

            {selectedPlayer && (
              <>
                <h2>Learning games</h2>
                {data && data.gameProgress.length > 0 ? (
                  <dl className="nf-stat-line">
                    {data.gameProgress.map((gp) => (
                      <div key={gp.game_key}>
                        <dt>{gameLabel(gp.game_key)}</dt>
                        <dd>
                          {gp.game_key === "daily"
                            ? `${gp.streak ?? 0}🔥`
                            : `${gp.correct}/${gp.total}`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>
                    No learning-game progress yet — tap below to start playing.
                  </p>
                )}
                <Link
                  href={`/games?player=${encodeURIComponent(selectedPlayer.id)}`}
                  className="nf-play-games-link"
                >
                  Play learning games as {selectedPlayer.displayName} →
                </Link>
              </>
            )}

            {(() => {
              const upcoming = data?.upcoming ?? [];
              const showUpcoming = upcoming.length > 0;
              const list = showUpcoming ? upcoming : (data?.games ?? []);
              return (
                <>
                  <h2>{showUpcoming ? "Upcoming games" : "Recent games"}</h2>
                  {list.map((g) => (
                    <article className="iw-member" key={g.id}>
                      <strong>vs {g.opponent}</strong>
                      <p>
                        {g.date} · {g.status}
                      </p>
                    </article>
                  ))}
                  {data && !list.length && <p>No shared games yet.</p>}
                </>
              );
            })()}

            <h2>Assigned practice</h2>
            {data?.practice.map((a) => {
              return (
                <article className="nf-card nf-section" key={a.id}>
                  <h3>
                    {
                      data.players.find((p) => p.id === a.player_id)
                        ?.display_name
                    }
                  </h3>
                  <p>{a.note}</p>
                  <p>{a.scenario_label}</p>
                  <p>{a.scenario_question}</p>
                  <div className="iw-position-answers">
                    {["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"].map(
                      (p) => (
                        <button
                          key={p}
                          disabled={busy}
                          onClick={() => answer(a.id, p)}
                        >
                          {p}
                        </button>
                      ),
                    )}
                  </div>
                  {result[a.id] && <p role="status">{result[a.id]}</p>}
                </article>
              );
            })}
            {data && !data.practice.length && (
              <p>
                Your coach’s assignments will appear here once your player is
                linked.
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
