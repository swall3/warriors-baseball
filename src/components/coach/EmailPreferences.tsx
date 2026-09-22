"use client";
import { useEffect, useState } from "react";
type Preferences = { games: boolean; training: boolean; billing: boolean };
type Row = {
  id: string;
  kind: string;
  status: string;
  created_at: string;
  last_error: string | null;
};
type Data = { preferences: Preferences; recent: Row[]; configured: boolean };
const labels = {
  games: "Game preparation, schedule changes and final reports",
  training: "New practice assignments",
  billing: "Subscription status and cancellation updates",
};
export function EmailPreferences({ team }: { team: string }) {
  const [data, setData] = useState<Data | null>(null),
    [draft, setDraft] = useState<Preferences>({
      games: false,
      training: false,
      billing: false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    setNotice("");
    fetch("/api/coach/billing/notifications?team=" + encodeURIComponent(team), {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
        setDraft(d.preferences);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [team, version]);
  async function act(action: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/coach/billing/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team, action, preferences: draft }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setDraft(d.preferences);
      setNotice(
        action === "save"
          ? "Email preferences saved."
          : action === "test"
            ? "Test requested. Check recent emails below; repeat requests within ten minutes reuse the same test."
            : "Processed eligible queued emails.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="notifications"
      className="nf-card mt-6"
      aria-labelledby="email-title"
    >
      <p className="nf-eyebrow">STAY IN THE LOOP</p>
      <h3 id="email-title" className="text-2xl font-bold mt-2">
        Team email notifications
      </h3>
      <p>
        Choose updates for your verified owner email. Other team members are not
        subscribed. Player names and practice notes stay inside the app.
      </p>
      {error && (
        <p role="alert" className="nf-notice">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="nf-notice">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">Loading email settings…</p>}
      {data && (
        <>
          <fieldset disabled={busy} className="space-y-4 my-5">
            <legend className="sr-only">Email categories</legend>
            {(Object.keys(labels) as (keyof Preferences)[]).map((k) => (
              <label key={k} className="flex gap-3 items-start">
                <input
                  type="checkbox"
                  checked={draft[k]}
                  onChange={(e) =>
                    setDraft({ ...draft, [k]: e.target.checked })
                  }
                  className="mt-1 h-5 w-5"
                />
                {labels[k]}
              </label>
            ))}
          </fieldset>
          <p className="text-sm">
            Uncheck all categories to stop team notifications. Sign-in codes
            still arrive when you request them. An email already being sent may
            still arrive.
          </p>
          <div className="flex flex-wrap gap-3 my-4">
            <button
              className="nf-button"
              disabled={busy}
              onClick={() => void act("save")}
            >
              Save email preferences
            </button>
            <button
              className="nf-button nf-button-secondary"
              disabled={busy || !data.configured}
              onClick={() => void act("test")}
            >
              Send me a test email
            </button>
            <button
              className="nf-button nf-button-secondary"
              disabled={busy || !data.configured}
              onClick={() => void act("retry")}
            >
              Retry queued emails
            </button>
          </div>
          {!data.configured && (
            <p className="nf-notice">
              Sending is not configured in this environment. Your preferences
              can still be saved.
            </p>
          )}
          <h4 className="font-bold mt-6">Recent emails</h4>
          <p className="text-sm">
            Accepted means the email provider received it, not that it reached
            your inbox. Queued emails retry during team activity or with the
            retry button.
          </p>
          {data.recent.length ? (
            <ul className="divide-y">
              {data.recent.map((row) => (
                <li key={row.id} className="py-3">
                  <strong>{row.kind.replaceAll("_", " ")}</strong> ·{" "}
                  {row.status === "accepted"
                    ? "Accepted by email provider"
                    : row.status === "review"
                      ? "Needs delivery review"
                      : row.status === "sending"
                        ? "Sending"
                        : row.status === "pending"
                          ? "Queued"
                          : "Skipped"}
                  <span className="block text-sm">
                    {new Date(row.created_at).toLocaleString()}
                    {row.last_error ? " — " + row.last_error : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No notification emails yet.</p>
          )}
        </>
      )}
      <button
        className="nf-button nf-button-secondary mt-3"
        disabled={busy}
        onClick={() => setVersion((v) => v + 1)}
      >
        Refresh email status
      </button>
    </section>
  );
}
