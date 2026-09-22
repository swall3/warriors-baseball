"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../coach/coach.css";
import "../coach/workspace.css";
type State = {
  user: { email: string } | null;
  organizations: { id: string; name: string }[];
};
export default function Account() {
  const [data, setData] = useState<State | null>(null),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [invite, setInvite] = useState("");
  async function load() {
    const r = await fetch("/api/account", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => {
    let active = true;
    const token =
      new URLSearchParams(location.hash.slice(1)).get("invite") ?? "";
    setInvite(token);
    if (token) sessionStorage.setItem("iw_pending_invite", token);
    else setInvite(sessionStorage.getItem("iw_pending_invite") ?? "");
    fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    })
      .catch(() => {})
      .then(() => {
        if (active)
          load().catch(() =>
            setMessage("Unable to load your account. Reload to retry."),
          );
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(action: string, orgId?: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orgId, email, token: code, invite }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Please sign in again.");
      if (action === "send") {
        setSent(true);
        setMessage(d.message);
      } else if (action === "select" || action === "accept") {
        if (action === "accept") sessionStorage.removeItem("iw_pending_invite");
        const from =
          new URLSearchParams(location.search).get("from") ?? "/coach/today";
        const safe =
          /^\/coach(?:\/|\?|$)/.test(from) && !from.includes("\\")
            ? from
            : "/coach/today";
        const record = sessionStorage.getItem("iw_return_record");
        sessionStorage.removeItem("iw_return_record");
        location.assign(
          safe +
            (record &&
            /^[A-Za-z0-9_-]{40,100}$/.test(record) &&
            /^\/coach\/live\//.test(safe)
              ? `#record=${record}`
              : ""),
        );
      } else await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="dugout-theme">
      <div className="nf-workspace">
        <main className="nf-main" style={{ maxWidth: 560 }}>
          <Link className="nf-wordmark" href="/">
            InningWise
          </Link>
          <section className="nf-card">
            <p className="nf-eyebrow">YOUR ACCOUNT</p>
            <h1>{invite ? "Join your team" : "Welcome back"}</h1>
            <p>Use your own email to access your organizations and teams.</p>
            {message && (
              <p role="status" className="nf-notice">
                {message}
              </p>
            )}
            {!data ? (
              <p>Loading account…</p>
            ) : !data.user ? (
              <form
                className="nf-account-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(sent ? "verify" : "send");
                }}
              >
                <label>
                  Email address
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setSent(false);
                    }}
                  />
                </label>
                {sent && (
                  <label>
                    Sign-in code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                )}
                <button disabled={busy}>
                  {busy
                    ? "Working…"
                    : sent
                      ? "Verify email"
                      : "Email me a code"}
                </button>
                {sent && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act("send")}
                  >
                    Send another code
                  </button>
                )}
              </form>
            ) : (
              <div className="nf-account-signedin">
                <p>
                  Signed in as <strong>{data.user.email}</strong>
                </p>
                {invite && (
                  <button disabled={busy} onClick={() => act("accept")}>
                    Accept team invitation
                  </button>
                )}
                <h2>Your organizations</h2>
                <div className="nf-account-orgs">
                  {data.organizations.map((o) => (
                    <button
                      key={o.id}
                      disabled={busy}
                      onClick={() => act("select", o.id)}
                    >
                      {o.name} →
                    </button>
                  ))}
                </div>
                {!data.organizations.length && (
                  <p>
                    Your coach or organization manager can invite this email
                    address.
                  </p>
                )}
                <h2>Manage</h2>
                <nav className="nf-account-manage">
                  <Link href="/coach/billing">Team billing</Link>
                  <Link href="/coach/access">People &amp; access</Link>
                </nav>
                <button
                  className="nf-account-signout"
                  disabled={busy}
                  onClick={() => act("signout")}
                >
                  Sign out
                </button>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
