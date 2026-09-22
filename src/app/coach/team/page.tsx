"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
type Player = {
  id: string;
  display_name: string;
  jersey_number: string | null;
  active: boolean;
};
export default function Team() {
  const { catalog, error, retry } = useCatalog();
  const [selected, setSelected] = useState("");
  const preferred =
    catalog?.teams.find(
      (t) =>
        t.name ===
        (catalog.organization.short_name || catalog.organization.name),
    ) ??
    catalog?.teams.find((t) => catalog.players.some((p) => p.team_id === t.id));
  const team =
    catalog?.teams.find((t) => t.id === selected) ??
    preferred ??
    catalog?.teams[0];
  useEffect(() => {
    if (!selected && team) setSelected(team.id);
  }, [selected, team]);
  return (
    <Workspace catalog={catalog} active="Team">
      <section className="nf-intro">
        <p className="nf-eyebrow">TEAM & ROSTER</p>
        <h2>Your team, ready to play.</h2>
        <p>
          Edit names and jerseys here. Set each game’s batting order and defense
          in Prepare.
        </p>
      </section>
      {error && <LoadError error={error} retry={retry} />}
      <label className="nf-label">
        Team
        <select
          value={team?.id ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {catalog?.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {team && catalog && (
        <TeamEditor
          key={team.id}
          team={team}
          editable={catalog.role !== "viewer"}
          refreshed={retry}
        />
      )}
      {catalog && !team && (
        <p className="nf-notice">
          No team has been set up for this organization yet.
        </p>
      )}
    </Workspace>
  );
}
function TeamEditor({
  team,
  editable,
  refreshed,
}: {
  team: { id: string; name: string };
  editable: boolean;
  refreshed: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coach/roster?teamId=${encodeURIComponent(team.id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setPlayers(d.players);
        setLoaded(true);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [team.id, version]);
  async function save(
    event: FormEvent<HTMLFormElement>,
    method: "PATCH" | "POST",
    extra: Record<string, unknown>,
  ) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/coach/roster", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: team.id,
          name: data.get("name"),
          jersey: data.get("jersey") ?? "",
          active: data.get("active") === "on",
          ...extra,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Unable to save.");
      if (method === "POST") form.reset();
      setNotice(
        "Saved. Future game setup will use this roster. Saved games keep their recorded lineup.",
      );
      setVersion((v) => v + 1);
      refreshed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="nf-section">
      {error && (
        <LoadError error={error} retry={() => setVersion((v) => v + 1)} />
      )}
      {notice && (
        <p className="nf-notice" role="status">
          {notice}
        </p>
      )}
      {editable && (
        <form
          className="nf-card"
          onSubmit={(e) => void save(e, "PATCH", { kind: "team" })}
        >
          <h3>Team details</h3>
          <label className="nf-label">
            Team name
            <input
              key={team.name}
              name="name"
              required
              maxLength={80}
              defaultValue={team.name}
            />
          </label>
          <button disabled={busy}>Save team name</button>
        </form>
      )}
      <div className="nf-section">
        <h3>Players</h3>
        <p>
          Inactive players keep their history and can be restored. They won’t
          appear in new game lineups.
        </p>
      </div>
      {!loaded && !error && <p>Loading roster…</p>}
      {loaded && !players.length && (
        <p>No players yet. Add the first player below.</p>
      )}
      <div className="nf-roster">
        {players.map((player) => (
          <article
            className="nf-card"
            key={`${player.id}:${player.display_name}:${player.jersey_number}:${player.active}`}
          >
            <h3>
              {player.jersey_number ? `#${player.jersey_number} · ` : ""}
              {player.display_name}
              {!player.active && " · Inactive"}
            </h3>
            <Link
              href={`/coach/training?player=${encodeURIComponent(player.id)}`}
            >
              Practice & progress →
            </Link>
            {editable && (
              <details className="nf-section">
                <summary>Edit {player.display_name}</summary>
                <form
                  onSubmit={(e) =>
                    void save(e, "PATCH", {
                      kind: "player",
                      playerId: player.id,
                    })
                  }
                >
                  <label className="nf-label">
                    Player name
                    <input
                      name="name"
                      defaultValue={player.display_name}
                      required
                      maxLength={80}
                    />
                  </label>
                  <label className="nf-label">
                    Jersey number
                    <input
                      name="jersey"
                      defaultValue={player.jersey_number ?? ""}
                      maxLength={8}
                    />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="active"
                      defaultChecked={player.active}
                    />{" "}
                    Active on roster
                  </label>
                  <div>
                    <button disabled={busy}>Save player</button>
                  </div>
                </form>
              </details>
            )}
          </article>
        ))}
      </div>
      {editable && (
        <form
          className="nf-card nf-section"
          onSubmit={(e) => void save(e, "POST", { kind: "player" })}
        >
          <h3>Add player</h3>
          <div className="nf-form-grid">
            <label className="nf-label">
              New player name
              <input name="name" required maxLength={80} />
            </label>
            <label className="nf-label">
              New player jersey
              <input name="jersey" maxLength={8} />
            </label>
          </div>
          <button disabled={busy}>Add player</button>
        </form>
      )}
      {editable && (
        <p className="nf-section">
          <Link className="nf-button" href="/coach/live/new">
            Prepare a game →
          </Link>
        </p>
      )}
    </section>
  );
}
