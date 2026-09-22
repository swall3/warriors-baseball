"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BACKUP_SCENARIOS } from "@/lib/gameData";
type Data = {
  games: { id: string; date: string; opponent: string; status: string }[];
  practice: {
    id: string;
    player_id: string;
    scenario_id: string;
    note: string;
  }[];
  players: { id: string; display_name: string }[];
  linkedPlayers: { id: string; teamId: string; displayName: string }[];
  selectedPlayerId: string | null;
};
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
  return (
    <div className="nf-workspace">
      <main className="nf-main">
        <header className="nf-top">
          <Link href="/">InningWise</Link>
          <Link href="/account">My account</Link>
        </header>
        <section className="nf-card">
          <p className="nf-eyebrow">FAMILY VIEW</p>
          <h1>Your team & your players</h1>
          <p>Game updates and coach-assigned practice, in one place.</p>
          {error && (
            <p role="alert" className="nf-notice">
              {error}
            </p>
          )}
          {data && data.linkedPlayers.length > 1 && (
            <nav aria-label="Choose a player" className="iw-kid-switcher">
              <button
                disabled={busy || !selected}
                aria-pressed={!selected}
                onClick={() => switchKid(null)}
              >
                All players
              </button>
              {data.linkedPlayers.map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  aria-pressed={selected === p.id}
                  onClick={() => switchKid(p.id)}
                >
                  {p.displayName}
                </button>
              ))}
            </nav>
          )}
          <h2>Games</h2>
          {data?.games.map((g) => (
            <article className="iw-member" key={g.id}>
              <strong>vs {g.opponent}</strong>
              <p>
                {g.date} · {g.status}
              </p>
            </article>
          ))}
          {data && !data.games.length && <p>No shared games yet.</p>}
          <h2>Assigned practice</h2>
          {data?.practice.map((a) => {
            const scenario = BACKUP_SCENARIOS.find(
              (s) => s.id === a.scenario_id,
            );
            return (
              <article className="nf-card nf-section" key={a.id}>
                <h3>
                  {data.players.find((p) => p.id === a.player_id)?.display_name}
                </h3>
                <p>{a.note}</p>
                <p>{scenario?.label}</p>
                <p>{scenario?.question}</p>
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
      </main>
    </div>
  );
}
