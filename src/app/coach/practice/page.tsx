"use client";
import "./practice.css";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { DRILLS, DRILL_CATEGORIES, type DrillCategory } from "@/lib/practice/drills";
import { PRACTICE_TEMPLATES } from "@/lib/practice/templates";
import { totalPlanDuration } from "@/lib/practice/aggregate";
import type { PracticeBlock } from "@/lib/practice/templates";
import type { TeamDrill } from "@/lib/practice/custom-drills";

type PlanRow = {
  id: string;
  team_id: string;
  name: string;
  description: string;
  source_template_id: string | null;
  blocks: PracticeBlock[];
  updated_at: string;
};

export default function PracticeLibrary() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<DrillCategory | "all">("all");
  const [version, setVersion] = useState(0);
  const [customDrills, setCustomDrills] = useState<TeamDrill[]>([]);
  const canEdit = catalog?.role !== "viewer";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/coach/practice", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setPlans(d.plans);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [version]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/practice/drills", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setCustomDrills(data.drills ?? []);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught.message);
      });
    return () => controller.abort();
  }, [version]);

  const shownDrills = category === "all" ? DRILLS : DRILLS.filter((d) => d.category === category);

  return (
    <Workspace catalog={catalog} active="Practice library">
      <section className="nf-intro">
        <p className="nf-eyebrow">PRACTICE &amp; DRILL LIBRARY</p>
        <h2>Plan the next practice, station by station.</h2>
        <p>
          Browse our preloaded drills and suggested practice templates, or open
          your team&apos;s saved plans below.
        </p>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      {error && <LoadError error={error} retry={() => setVersion((v) => v + 1)} />}

      <section className="nf-card nf-section" aria-label="Your team's saved practice plans">
        <h3>Your saved practice plans</h3>
        {loading && <p role="status">Loading practice plans…</p>}
        {!loading && !plans.length && !error && (
          <p className="nf-muted">
            No saved plans yet. Clone a template below or build one from scratch.
          </p>
        )}
        <div className="nf-plan-grid">
          {plans.map((p) => (
            <Link href={`/coach/practice/${p.id}`} className="nf-card" key={p.id}>
              <p className="nf-eyebrow">
                {p.source_template_id ? "FROM TEMPLATE" : "CUSTOM PLAN"}
              </p>
              <h3>{p.name}</h3>
              <p className="nf-muted">
                {p.blocks.length} station{p.blocks.length === 1 ? "" : "s"} ·{" "}
                {totalPlanDuration(p.blocks)} min planned
              </p>
            </Link>
          ))}
        </div>
        {canEdit && (
          <Link className="nf-button" href="/coach/practice/builder">
            Build a plan from scratch →
          </Link>
        )}
      </section>

      <section className="nf-card nf-section" aria-label="Suggested practice templates">
        <h3>Suggested practice templates</h3>
        <p className="nf-muted">
          Preloaded plans you can clone and customize for your team.
        </p>
        <div className="nf-template-grid">
          {PRACTICE_TEMPLATES.map((t) => (
            <div className="nf-card" key={t.id}>
              <h3>{t.name}</h3>
              <p>{t.description}</p>
              <div className="nf-drill-meta">
                {t.ageBands.map((a) => (
                  <span className="nf-tag" key={a}>
                    {a}
                  </span>
                ))}
              </div>
              <p className="nf-muted">
                {t.blocks.length} stations · {totalPlanDuration(t.blocks)} min
              </p>
              {canEdit && (
                <Link className="nf-button" href={`/coach/practice/builder?template=${t.id}`}>
                  Clone this template →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="nf-card nf-section" aria-label="Your team's custom drills">
        <div className="nf-section-heading">
          <div>
            <h3>Team-authored drills</h3>
            <p className="nf-muted">Write your own drill once, then reuse it in any saved practice.</p>
          </div>
          {canEdit && <Link className="nf-button nf-compact-button" href="/coach/practice/drills/new">Create team drill →</Link>}
        </div>
        {!customDrills.length && <p className="nf-muted">No custom drills yet.</p>}
        <div className="nf-drill-grid">
          {customDrills.map((drill) => (
            <article className="nf-card" key={drill.id}>
              <p className="nf-eyebrow">TEAM DRILL</p>
              <h3>{drill.name}</h3>
              <p className="nf-muted">{drill.durationMinutes} min · {drill.category}</p>
              <p>{drill.setup}</p>
              {canEdit && <Link href={`/coach/practice/drills/${drill.id}`}>Edit drill →</Link>}
            </article>
          ))}
        </div>
      </section>

      <section className="nf-card nf-section" aria-label="Drill catalog">
        <h3>Drill catalog</h3>
        <label className="nf-label">
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value as DrillCategory | "all")}>
            <option value="all">All categories</option>
            {DRILL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="nf-drill-grid">
          {shownDrills.map((d) => (
            <details className="nf-card" key={d.id}>
              <summary>
                <strong>{d.name}</strong> · {d.durationMinutes} min
              </summary>
              <div className="nf-drill-meta">
                <span className="nf-tag">{d.category}</span>
                {d.positions.map((p) => (
                  <span className="nf-tag" key={p}>
                    {p}
                  </span>
                ))}
                {d.ageBands.map((a) => (
                  <span className="nf-tag" key={a}>
                    {a}
                  </span>
                ))}
              </div>
              <p>
                <strong>Players:</strong> {d.players}
              </p>
              <p>
                <strong>Space:</strong> {d.space}
              </p>
              <p>
                <strong>Equipment:</strong> {d.equipment.join(", ")}
              </p>
              <p>
                <strong>Setup:</strong> {d.setup}
              </p>
              <ol>
                {d.instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {d.coachingCue && <p className="nf-muted">Coach cue: {d.coachingCue}</p>}
            </details>
          ))}
        </div>
      </section>
    </Workspace>
  );
}
