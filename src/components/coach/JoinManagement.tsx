"use client";

import { useEffect, useState } from "react";

type LinkRow = { token: string; team_id: string | null; kind: "parent" | "coach"; expires_at: string };
type RequestRow = { id: string; team_id: string | null; kind: "parent" | "coach";
  child_name: string | null; note: string | null; user_id: string; created_at: string };
type Data = { links: LinkRow[]; requests: RequestRow[]; users: { id: string; email: string }[] };
type Team = { id: string; name: string };
type Player = { id: string; team_id: string; display_name: string };

function JoinQr({ link, label }: { link: string; label: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    import("qrcode").then((qr) => qr.toDataURL(link, {
      width: 200, margin: 2, errorCorrectionLevel: "M",
    })).then((value) => { if (active) setImage(value); }).catch(() => {});
    return () => { active = false; };
  }, [link]);
  if (!image) return null;
  return <div className="iw-join-qr">
    {/* QR is generated on-device; the join token is not sent to an image service. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image} width={200} height={200} alt={`${label} join QR code`} />
    <a href={image} download={`${label}-join-qr.png`}>Download QR code</a>
  </div>;
}

export function JoinManagement({ teamId, admin, canCoach, teams, players }: {
  teamId: string; admin: boolean; canCoach: boolean; teams: Team[]; players: Player[];
}) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  async function load() {
    const r = await fetch("/api/coach/join", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
  }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  async function act(body: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const r = await fetch("/api/coach/join", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setMessage(body.action === "create_link" ? "New link ready to share. The previous link is off."
        : body.action === "revoke_link" ? "Join link turned off." : "Request reviewed.");
    } catch (e) { setError(e instanceof Error ? e.message : "Please retry."); }
    finally { setBusy(false); }
  }
  const url = (token: string) => `${location.origin}/account#join=${token}`;
  async function copy(token: string) {
    try { await navigator.clipboard.writeText(url(token)); setMessage("Link copied."); }
    catch { setError("Select and copy the link below."); }
  }
  const parentLink = data?.links.find((l) => l.kind === "parent" && l.team_id === teamId);
  const coachLink = data?.links.find((l) => l.kind === "coach");
  const pending = (data?.requests ?? []).filter((r) => r.kind === "coach" ? admin : r.team_id === teamId);
  const linkCard = (kind: "parent" | "coach", link?: LinkRow) => (
    <div className="iw-member" style={{ display: "block" }}>
      <strong>{kind === "parent" ? "Parent join link" : "Organization coach join link"}</strong>
      <p>{kind === "parent" ? "Share one link with this team’s families. Each parent verifies their email and names their children. You approve each child link."
        : "Share with a prospective coach. An organization manager approves their team and role."}</p>
      {link && <>
        <label>Shareable link
          <input readOnly value={url(link.token)} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <JoinQr link={url(link.token)} label={kind} />
        <p>Expires {new Date(link.expires_at).toLocaleDateString()}.</p>
        <div className="iw-member-actions">
          <button type="button" disabled={busy} onClick={() => void copy(link.token)}>Copy link</button>
          <button type="button" disabled={busy} onClick={() => void act({ action: "revoke_link", token: link.token })}>Turn off link</button>
        </div>
      </>}
      <button type="button" disabled={busy} onClick={() => void act({ action: "create_link", kind,
        teamId: kind === "parent" ? teamId : null })}>
        {link ? "Replace link" : "Create link"}
      </button>
    </div>
  );
  return <section className="iw-join-management">
    <h2>Self-service joining</h2>
    <p>Parents and coaches enter their own email. No access is granted until you review the request.</p>
    {error && <p className="nf-notice" role="alert">{error}</p>}
    {message && <p className="nf-notice" role="status">{message}</p>}
    {canCoach && teamId && linkCard("parent", parentLink)}
    {admin && linkCard("coach", coachLink)}
    <h3>Pending join requests</h3>
    {!pending.length && <p>No requests waiting for approval.</p>}
    {pending.map((r) => {
      const person = data?.users.find((u) => u.id === r.user_id)?.email ?? "Verified account";
      const pickedTeam = choices[`${r.id}:team`] ?? "";
      const pickedRole = choices[`${r.id}:role`] ?? "assistant_coach";
      const pickedPlayer = choices[`${r.id}:player`] ?? "";
      return <article className="iw-member" key={r.id} style={{ display: "block" }}>
        <strong>{person}</strong>
        <p>{r.kind === "parent" ? `Claims ${r.child_name} on ${teams.find((t) => t.id === r.team_id)?.name ?? "this team"}`
          : `Requests a coach role${r.note ? ` · ${r.note}` : ""}`}</p>
        {r.kind === "parent" ? <label>Match to roster player
          <select value={pickedPlayer} onChange={(e) => setChoices({ ...choices, [`${r.id}:player`]: e.target.value })}>
            <option value="">Choose the correct child</option>
            {players.filter((p) => p.team_id === r.team_id).map((p) =>
              <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </label> : <>
          <label>Assign to team
            <select value={pickedTeam} onChange={(e) => setChoices({ ...choices, [`${r.id}:team`]: e.target.value })}>
              <option value="">Choose team</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label>Coach role
            <select value={pickedRole} onChange={(e) => setChoices({ ...choices, [`${r.id}:role`]: e.target.value })}>
              <option value="assistant_coach">Assistant coach</option>
              <option value="head_coach">Head coach (only if vacant)</option>
            </select>
          </label>
        </>}
        <div className="iw-member-actions">
          <button type="button" disabled={busy || (r.kind === "parent" ? !pickedPlayer : !pickedTeam)}
            onClick={() => void act({ action: "approve", requestId: r.id,
              playerId: r.kind === "parent" ? pickedPlayer : null,
              teamId: r.kind === "coach" ? pickedTeam : null,
              role: r.kind === "coach" ? pickedRole : null })}>Approve</button>
          <button type="button" disabled={busy} onClick={() => void act({ action: "reject", requestId: r.id })}>Decline</button>
        </div>
      </article>;
    })}
  </section>;
}
