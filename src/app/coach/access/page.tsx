"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { JoinManagement } from "@/components/coach/JoinManagement";
type Member = { user_id: string; role: string; team_id?: string };
type Access = {
  organization: { name: string; account_access_enabled: boolean };
  userId: string;
  orgRole: string;
  teamRoles: Record<string, string>;
  teams: { id: string; name: string }[];
  orgMembers: Member[];
  members: Member[];
  people: { id: string; email: string }[];
  invites: {
    id: string;
    team_id: string | null;
    email: string;
    role: string;
    expires_at: string;
  }[];
  audit: { id: number; action: string; created_at: string }[];
};
type Command = {
  action: string;
  teamId?: string;
  userId?: string;
  invitationId?: string;
  role?: string;
};
const label = (r: string) =>
  ({
    owner: "Organization owner",
    manager: "Organization manager",
    member: "Team member",
    head_coach: "Head coach",
    assistant_coach: "Assistant coach",
    parent: "Parent",
  })[r] ?? r;
export default function TeamAccess() {
  const dialog = useRef<HTMLDialogElement>(null);
  const { catalog, error: catalogError, retry } = useCatalog();
  const [data, setData] = useState<Access | null>(null),
    [team, setTeam] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("assistant_coach"),
    [player, setPlayer] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [link, setLink] = useState(""),
    [revision, setRevision] = useState(0),
    [confirm, setConfirm] = useState<{
      command: Command;
      description: string;
    } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/coach/access", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
        setTeam((t) => t || d.teams[0]?.id || "");
        setError("");
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [revision]);
  useEffect(() => {
    if (confirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm]);
  const admin = data?.orgRole === "owner" || data?.orgRole === "manager",
    owner = data?.orgRole === "owner",
    head = data?.teamRoles[team] === "head_coach";
  const allowedRoles = team
    ? admin
      ? ["head_coach", "assistant_coach", "parent"]
      : head
        ? ["assistant_coach", "parent"]
        : ["parent"]
    : ["manager"];
  const chosenRole = allowedRoles.includes(role) ? role : allowedRoles[0];
  const people = (id: string) =>
    data?.people.find((p) => p.id === id)?.email ?? "Member";
  async function act(command: Command | Record<string, unknown>) {
    setBusy(true);
    setError("");
    setMessage("");
    setLink("");
    try {
      const r = await fetch("/api/coach/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(
        command.action === "invite"
          ? d.emailAccepted
            ? "Invitation sent. Access begins when the recipient verifies their email and accepts."
            : "Invitation created. Email was not confirmed; copy the link below to share it."
          : "Access updated.",
      );
      if (d.inviteLink) setLink(d.inviteLink);
      if (d.teamId) setTeam(d.teamId);
      setConfirm(null);
      setRevision((n) => n + 1);
      retry();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please retry.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Workspace catalog={catalog} active="Team">
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      <section className="nf-card nf-section">
        <p className="nf-eyebrow">ORGANIZATION & TEAMS</p>
        <h2>People & access</h2>
        <p>
          Your organization keeps its teams, rosters, games, and history when
          coaches change.
        </p>
        <p>
          <Link href="/account">
            Sign in with email or switch organizations →
          </Link>
        </p>
        {error && (
          <p className="nf-notice" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="nf-notice" role="status">
            {message}
          </p>
        )}
        {link && (
          <label>
            Invitation link (expires in 7 days)
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
            <button
              disabled={busy}
              onClick={() =>
                navigator.clipboard
                  .writeText(link)
                  .then(() => setMessage("Invitation link copied."))
                  .catch(() => setMessage("Select and copy the link above."))
              }
            >
              Copy invitation link
            </button>
          </label>
        )}
        {data && !data.organization.account_access_enabled && (
          <div className="nf-notice">
            <h3>Switch to individual accounts</h3>
            <p>
              Everyone will sign in with their own email. Existing shared
              passcodes will stop working. Your verified owner account will keep
              full access.
            </p>
            {owner && (
              <button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    command: { action: "enable" },
                    description:
                      "Enable individual accounts for this organization? Everyone using a shared passcode will need an email invitation to continue.",
                  })
                }
              >
                Enable individual accounts
              </button>
            )}
          </div>
        )}
        {data && (
          <>
            <div className="iw-role-guide">
              <div>
                <strong>Organization managers</strong>
                <p>Manage every team and replace a coach who leaves.</p>
              </div>
              <div>
                <strong>Head & assistant coaches</strong>
                <p>
                  Manage assigned teams. Head coaches assign assistants; both
                  can invite parents.
                </p>
              </div>
              <div>
                <strong>Parents</strong>
                <p>
                  View team updates and practice assigned to their linked
                  children.
                </p>
              </div>
            </div>
            <label>
              Manage access for
              <select
                value={team}
                onChange={(e) => {
                  setTeam(e.target.value);
                  setPlayer("");
                }}
              >
                {owner && <option value="">Entire organization</option>}
                {data.teams.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="iw-access-members">
              {(team
                ? data.members.filter((m) => m.team_id === team)
                : data.orgMembers.filter((m) => m.role !== "member")
              ).map((m) => (
                <article className="iw-member" key={m.user_id}>
                  <div>
                    <strong>{people(m.user_id)}</strong>
                    <p>
                      {label(m.role)}
                      {m.user_id === data.userId ? " · You" : ""}
                    </p>
                  </div>
                  <div className="iw-member-actions">
                    {team &&
                      m.role === "assistant_coach" &&
                      (admin || head) && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              command: {
                                action: "transfer_team",
                                teamId: team,
                                userId: m.user_id,
                              },
                              description: `Make ${people(m.user_id)} head coach? The previous head coach will lose their team membership. Organization managers retain their organization access. Team history and billing stay unchanged.`,
                            })
                          }
                        >
                          Make head coach
                        </button>
                      )}
                    {!team && owner && m.role === "manager" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            command: {
                              action: "transfer_org",
                              userId: m.user_id,
                            },
                            description: `Transfer organization ownership to ${people(m.user_id)}? You will remain an organization manager. Billing ownership stays unchanged.`,
                          })
                        }
                      >
                        Transfer organization
                      </button>
                    )}
                    {team && m.role === "parent" && (admin || head) && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          setConfirm({
                            command: {
                              action: "set_role",
                              teamId: team,
                              userId: m.user_id,
                              role: "assistant_coach",
                            },
                            description: `Give ${people(m.user_id)} assistant-coach access to this team's roster, games, and practice? Their linked children will stay in their family view.`,
                          })
                        }
                      >
                        Make assistant coach
                      </button>
                    )}
                    {m.role !== "owner" &&
                      (admin || head || m.role === "parent") && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            setConfirm({
                              command: {
                                action: "remove_member",
                                teamId: team || undefined,
                                userId: m.user_id,
                              },
                              description: `Remove ${people(m.user_id)} from ${team ? "this team" : "the organization and all its teams"}? Their access and outstanding recorder links will be revoked. Team history will remain.`,
                            })
                          }
                        >
                          Remove access
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
            {(admin || head || data.teamRoles[team] === "assistant_coach") && (
              <JoinManagement teamId={team} admin={!!admin} canCoach
                teams={data.teams} players={catalog?.players ?? []} />
            )}
            <form
              className="iw-access-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  action: "invite",
                  teamId: team || null,
                  email,
                  role: chosenRole,
                  playerId: chosenRole === "parent" ? player : undefined,
                });
              }}
            >
              <h3>Invite someone</h3>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <label>
                Role
                <select
                  value={chosenRole}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>
                      {label(r)}
                    </option>
                  ))}
                </select>
              </label>
              {chosenRole === "parent" && (
                <label>
                  Link to player
                  <select
                    required
                    value={player}
                    onChange={(e) => setPlayer(e.target.value)}
                  >
                    <option value="">Choose a player</option>
                    {catalog?.players
                      .filter((p) => p.team_id === team)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p>
                Invitations expire after 7 days. Recipients must verify the
                invited email. Invite a parent again to link another child.
              </p>
              <button
                disabled={busy || !data.organization.account_access_enabled}
              >
                Send invitation
              </button>
            </form>
            <h3>Pending invitations</h3>
            {data.invites
              .filter((i) => (i.team_id ?? "") === team)
              .map((i) => (
                <div className="iw-member" key={i.id}>
                  <p>
                    <strong>{i.email}</strong>
                    <br />
                    {label(i.role)} · Expires{" "}
                    {new Date(i.expires_at).toLocaleDateString()}
                  </p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      act({ action: "revoke_invite", invitationId: i.id })
                    }
                  >
                    Revoke invitation
                  </button>
                </div>
              ))}
            {!data.invites.some((i) => (i.team_id ?? "") === team) && (
              <p>No pending invitations.</p>
            )}
            {admin && (
              <form
                className="iw-access-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act({ action: "create_team", name });
                }}
              >
                <h3>Add a team to your organization</h3>
                <label>
                  Team name
                  <input
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Create team</button>
              </form>
            )}
            {admin && (
              <details>
                <summary>Recent access changes</summary>
                {data.audit.map((a) => (
                  <p key={a.id}>
                    {a.action.replaceAll("_", " ")} ·{" "}
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                ))}
              </details>
            )}
            <p>
              Coaching access and payment responsibility are separate. A coach
              handoff does not change a subscription or transfer saved payment
              details.
            </p>
          </>
        )}
      </section>
      <dialog
        ref={dialog}
        className="nf-card iw-confirm"
        aria-labelledby="access-confirm-title"
        onCancel={() => setConfirm(null)}
      >
        {confirm && (
          <>
            <h2 id="access-confirm-title">Confirm access change</h2>
            <p>{confirm.description}</p>
            {error && <p role="alert">{error}</p>}
            <button autoFocus disabled={busy} onClick={() => setConfirm(null)}>
              Keep current access
            </button>
            <button disabled={busy} onClick={() => act(confirm.command)}>
              {busy ? "Updating…" : "Confirm change"}
            </button>
          </>
        )}
      </dialog>
    </Workspace>
  );
}
