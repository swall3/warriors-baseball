"use client";
import { useState } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
export default function Team() {
  const { catalog, error, retry } = useCatalog();
  const [selected, setSelected] = useState("");
  const rosterTeams =
    catalog?.teams.filter((t) =>
      catalog.players.some((p) => p.team_id === t.id),
    ) ?? [];
  const teamId = selected || rosterTeams[0]?.id;
  const roster = catalog?.players.filter((p) => p.team_id === teamId) ?? [];
  return (
    <Workspace catalog={catalog} active="Team">
      <section className="nf-intro">
        <p className="nf-eyebrow">ROSTER & PLAYER DEVELOPMENT</p>
        <h2>Everyone has a place.</h2>
      </section>
      {error && <LoadError error={error} retry={retry} />}
      <label className="nf-label">
        Team
        <select
          value={teamId ?? ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          {rosterTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {catalog && !roster.length && (
        <p className="nf-notice">
          This organization has no active roster yet. Add the team and players
          before preparing a shared game.
        </p>
      )}
      <div className="nf-roster">
        {roster.map((p) => (
          <Link
            href={`/coach/training?player=${encodeURIComponent(p.id)}`}
            className="nf-card nf-player"
            key={p.id}
          >
            <span className="nf-jersey">{p.jersey_number ?? "–"}</span>
            <span>
              <strong>{p.display_name}</strong>
              <small>Practice & progress →</small>
            </span>
          </Link>
        ))}
      </div>
    </Workspace>
  );
}
