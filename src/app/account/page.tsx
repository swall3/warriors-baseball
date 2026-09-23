"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../coach/coach.css";
import "../coach/workspace.css";
type State = {
  user: { email: string } | null;
  organizations: {
    id: string;
    name: string;
    role: "owner" | "manager" | "member";
    canManageTeam: boolean;
    hasFamily: boolean;
  }[];
  selected?: string | null;
};
type JoinInfo = {
  orgId: string;
  teamId: string | null;
  kind: "parent" | "coach";
  orgName: string;
  teamName: string | null;
  expiresAt: string;
};
type JoinRequest = {
  id: string;
  org_id: string;
  team_id: string | null;
  kind: "parent" | "coach";
  child_name: string | null;
  status: "pending" | "approved" | "rejected";
};
function JoinLinkInput({ busy, onUse }: { busy: boolean; onUse: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <form className="nf-account-form" onSubmit={(e) => { e.preventDefault(); onUse(value); }}>
    <h2>Join an existing organization</h2>
    <p>Paste the link your coach shared, or scan its QR code with your phone.</p>
    <label>Shared join link
      <input required value={value} onChange={(e) => setValue(e.target.value)}
        placeholder="Paste link or code" autoComplete="off" />
    </label>
    <button disabled={busy}>Open join link</button>
  </form>;
}
export default function Account() {
  const [data, setData] = useState<State | null>(null),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [invite, setInvite] = useState(""),
    [join, setJoin] = useState(""),
    [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null),
    [requests, setRequests] = useState<JoinRequest[]>([]),
    [creating, setCreating] = useState(false),
    [orgName, setOrgName] = useState(""),
    [teamName, setTeamName] = useState(""),
    [childName, setChildName] = useState(""),
    [coachNote, setCoachNote] = useState("");
  async function load() {
    const r = await fetch("/api/account", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  async function loadJoin(token: string) {
    const r = await fetch(`/api/onboarding?token=${encodeURIComponent(token)}`, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) {
      setJoin(""); setJoinInfo(null);
      sessionStorage.removeItem("iw_pending_join");
      if (location.hash) history.replaceState(null, "", "/account");
      throw new Error(d.error);
    }
    setJoinInfo(d.link);
    setRequests(d.requests ?? []);
  }
  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(location.hash.slice(1));
    const invitation = hash.get("invite") ?? "";
    const joinToken = hash.get("join") ?? "";
    setInvite(joinToken ? "" : invitation || sessionStorage.getItem("iw_pending_invite") || "");
    setJoin(invitation ? "" : joinToken || sessionStorage.getItem("iw_pending_join") || "");
    setCreating(new URLSearchParams(location.search).get("intent") === "create");
    if (invitation) sessionStorage.setItem("iw_pending_invite", invitation);
    if (joinToken) sessionStorage.setItem("iw_pending_join", joinToken);
    const onHashChange = () => {
      const current = new URLSearchParams(location.hash.slice(1));
      const nextJoin = current.get("join") ?? "";
      const nextInvite = current.get("invite") ?? "";
      if (nextJoin) {
        sessionStorage.setItem("iw_pending_join", nextJoin);
        setJoin(nextJoin); setInvite("");
        void loadJoin(nextJoin).catch((e) => setMessage(e.message));
      } else if (nextInvite) {
        sessionStorage.setItem("iw_pending_invite", nextInvite);
        setInvite(nextInvite); setJoin(""); setJoinInfo(null);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    fetch("/api/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    })
      .catch(() => {})
      .then(() => {
        if (active) {
          load().catch(() => setMessage("Unable to load your account. Reload to retry."));
          if (joinToken || sessionStorage.getItem("iw_pending_join"))
            loadJoin(joinToken || sessionStorage.getItem("iw_pending_join")!)
              .catch((e) => setMessage(e.message));
        }
      });
    return () => {
      active = false;
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);
  async function act(action: string, orgId?: string) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orgId, email, token: code, invite, join,
          intent: creating ? "create" : undefined, name: orgName, teamName }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Please sign in again.");
      if (action === "send") {
        setSent(true);
        setMessage(d.message);
      } else if (action === "select" || action === "accept" || action === "create_org") {
        if (action === "accept") sessionStorage.removeItem("iw_pending_invite");
        if (action === "create_org") sessionStorage.removeItem("iw_pending_join");
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
      } else {
        if (action === "signout") {
          setSent(false); setCode(""); setEmail("");
        }
        await load();
        if (join) await loadJoin(join);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  async function requestJoin() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/onboarding", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", token: join, childName, note: coachNote }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage("Request sent. A coach or organization manager will review it.");
      setChildName("");
      setCoachNote("");
      await loadJoin(join);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please retry.");
    } finally { setBusy(false); }
  }
  function useJoinLink(value: string) {
    let token = value.trim();
    try {
      if (/^https?:\/\//i.test(token)) token = new URLSearchParams(new URL(token).hash.slice(1)).get("join") ?? "";
    } catch { token = ""; }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setMessage("Enter a valid InningWise join link or code.");
      return;
    }
    setMessage(""); setCreating(false); setInvite(""); setJoin(token);
    sessionStorage.setItem("iw_pending_join", token);
    history.replaceState(null, "", `/account#join=${token}`);
    void loadJoin(token).catch((e) => setMessage(e.message));
  }
  return (
    <div className="dugout-theme">
      <div className="nf-workspace">
        <main className="nf-main" style={{ maxWidth: 560 }}>
          <nav className="nf-account-top" aria-label="Account links">
            <Link className="nf-wordmark" href="/">InningWise</Link>
            <Link href="/install#parents" className="nf-account-link">Install help</Link>
          </nav>
          <section className="nf-card">
            <p className="nf-eyebrow">YOUR ACCOUNT</p>
            <h1>{invite || join ? "Join your team" : creating ? "Create a coach account" : "Welcome back"}</h1>
            <p>Use your own email to access your organizations and teams.</p>
            {joinInfo && <p className="nf-notice">
              {joinInfo.kind === "parent" ? `Parent access for ${joinInfo.teamName} at ${joinInfo.orgName}`
                : `Coach access request for ${joinInfo.orgName}`}. Verify your email, then submit a request for approval.
            </p>}
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
                {!invite && !join && !creating && (
                  <button type="button" disabled={busy} onClick={() => setCreating(true)}>
                    Create a coach account
                  </button>
                )}
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
                {joinInfo && (
                  <form className="nf-account-form" onSubmit={(e) => { e.preventDefault(); void requestJoin(); }}>
                    <h2>{joinInfo.kind === "parent" ? "Request Family access" : "Request coach access"}</h2>
                    {joinInfo.kind === "parent" ? (
                      <label>Your child’s name on the roster
                        <input required minLength={2} maxLength={80} value={childName}
                          onChange={(e) => setChildName(e.target.value)} />
                      </label>
                    ) : (
                      <label>Note to the organization manager (optional)
                        <textarea maxLength={300} value={coachNote}
                          onChange={(e) => setCoachNote(e.target.value)} />
                      </label>
                    )}
                    <p>No team or child access is granted until a coach approves your request. You can submit another child separately.</p>
                    <button disabled={busy}>Send request</button>
                    <button type="button" disabled={busy} onClick={() => {
                      void Promise.all([load(), loadJoin(join)]).catch((e) => setMessage(e.message));
                    }}>Refresh status</button>
                    <button type="button" disabled={busy} onClick={() => {
                      sessionStorage.removeItem("iw_pending_join");
                      history.replaceState(null, "", "/account");
                      setJoin(""); setJoinInfo(null);
                    }}>Done for now</button>
                    {requests.filter((r) => r.kind === joinInfo.kind && r.org_id === joinInfo.orgId &&
                      r.team_id === joinInfo.teamId).map((r) => (
                      <p key={r.id}>{r.child_name || "Coach request"}: {r.status}</p>
                    ))}
                  </form>
                )}
                {!join && !invite && (creating || !data.organizations.length ? (
                  <form className="nf-account-form" onSubmit={(e) => { e.preventDefault(); void act("create_org"); }}>
                    <h2>Create an organization</h2>
                    <label>Organization or club name
                      <input required minLength={2} maxLength={80} value={orgName}
                        onChange={(e) => setOrgName(e.target.value)} />
                    </label>
                    <label>First team name
                      <input required minLength={2} maxLength={80} value={teamName}
                        onChange={(e) => setTeamName(e.target.value)} />
                    </label>
                    <button disabled={busy}>Create organization</button>
                    <p>Already part of a club? Ask its manager for a coach join link instead.</p>
                  </form>
                ) : <button type="button" disabled={busy} onClick={() => setCreating(true)}>
                  Create another organization
                </button>)}
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
                {!data.organizations.length && !join && (
                  <p>
                    No organizations yet. Create one above, or ask your manager for a coach join link.
                  </p>
                )}
                {(() => {
                  const organization = data.organizations.find(
                    (org) => org.id === data.selected,
                  );
                  if (!organization) return null;
                  const canManageOrganization =
                    organization.role === "owner" || organization.role === "manager";
                  return (
                    <>
                      <h2>Go to {organization.name}</h2>
                      <nav className="nf-account-manage" aria-label="Organization pages">
                        {(canManageOrganization || organization.canManageTeam || !organization.hasFamily) && (
                          <Link href="/coach/today">Team workspace</Link>
                        )}
                        {organization.hasFamily && <Link href="/coach/family">Family view</Link>}
                        {(canManageOrganization || organization.canManageTeam) && (
                          <Link href="/coach/access">People &amp; access</Link>
                        )}
                        {organization.role === "owner" && (
                          <Link href="/coach/billing">Organization billing</Link>
                        )}
                      </nav>
                    </>
                  );
                })()}
                <button
                  className="nf-account-signout"
                  disabled={busy}
                  onClick={() => act("signout")}
                >
                  Sign out
                </button>
              </div>
            )}
            {!join && !invite && <JoinLinkInput busy={busy} onUse={useJoinLink} />}
          </section>
        </main>
      </div>
    </div>
  );
}
