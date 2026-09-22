"use client";
import "../practice.css";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { getDrill } from "@/lib/practice/drills";
import type { PracticeBlock } from "@/lib/practice/templates";
import { aggregateEquipment, totalPlanDuration, unresolvedDrillIds } from "@/lib/practice/aggregate";
import type { TeamDrill } from "@/lib/practice/custom-drills";

type PlanRow = {
  id: string;
  team_id: string;
  name: string;
  description: string;
  source_template_id: string | null;
  blocks: PracticeBlock[];
  created_at: string;
  updated_at: string;
  source_game_id: string | null;
  recommendation_context: Record<string, unknown> | null;
};

export default function PracticePlanView() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const params = useParams<{ planId: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [customDrills, setCustomDrills] = useState<TeamDrill[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coach/practice/${params.planId}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setPlan(d.plan);
        setCustomDrills(d.customDrills ?? []);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [params.planId]);

  async function remove() {
    if (deleting || !plan) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/coach/practice/${plan.id}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push("/coach/practice");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  const canEdit = catalog?.role !== "viewer";
  const customDrillMap = new Map(customDrills.map((drill) => [drill.id, drill]));
  const resolveDrill = (id: string) => getDrill(id) ?? customDrillMap.get(id);

  return (
    <Workspace catalog={catalog} active="Practice library">
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      {error && <LoadError error={error} retry={() => location.reload()} />}
      {!plan && !error && <p role="status">Loading practice plan…</p>}
      {plan && (
        <>
          <div className="nf-no-print">
            <p className="nf-eyebrow">
              {plan.source_template_id ? "FROM TEMPLATE" : "CUSTOM PLAN"}
            </p>
            <div className="nf-action-row">
              <Link className="nf-secondary" href="/coach/practice">
                ← Back to library
              </Link>
              {canEdit && (
                <>
                  <Link className="nf-button" href={`/coach/practice/builder?edit=${plan.id}`}>
                    Edit plan
                  </Link>
                  <button className="nf-secondary" onClick={() => void remove()} disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete plan"}
                  </button>
                </>
              )}
              <Link className="nf-button" href={`/coach/practice/${plan.id}/run`}>
                Run practice
              </Link>
              <button onClick={() => window.print()}>Print</button>
            </div>
          </div>

          <section className="nf-print-area nf-card nf-section">
            <h2>{plan.name}</h2>
            {plan.description && <p>{plan.description}</p>}
            {plan.source_game_id && (
              <p className="nf-notice">Created from a postgame recommendation. <Link href={`/coach/live/${plan.source_game_id}/insights`}>Review the source game →</Link></p>
            )}
            <p className="nf-muted">
              {plan.blocks.length} station{plan.blocks.length === 1 ? "" : "s"} ·{" "}
              {totalPlanDuration(plan.blocks)} min planned total
            </p>

            {plan.blocks.map((block, i) => (
              <div className="nf-station" key={block.id}>
                <h3>
                  Station {i + 1}: {block.label} ({block.durationMinutes} min)
                </h3>
                {block.drillIds.map((id) => {
                  const drill = resolveDrill(id);
                  if (!drill)
                    return (
                      <p className="nf-notice" key={id} role="alert">
                        Drill {id} is no longer in the catalog.
                      </p>
                    );
                  return (
                    <div key={id}>
                      <h4>{drill.name}</h4>
                      <p className="nf-muted">
                        {drill.durationMinutes} min · {drill.players} · {drill.space}
                      </p>
                      <p>
                        <strong>Equipment:</strong> {drill.equipment.join(", ")}
                      </p>
                      <p>
                        <strong>Setup:</strong> {drill.setup}
                      </p>
                      <ol>
                        {drill.instructions.map((step, si) => (
                          <li key={si}>{step}</li>
                        ))}
                      </ol>
                      {drill.coachingCue && <p className="nf-muted">Coach cue: {drill.coachingCue}</p>}
                    </div>
                  );
                })}
              </div>
            ))}

            <h3>Equipment checklist</h3>
            <ul className="nf-equipment-list">
              {aggregateEquipment(plan.blocks, resolveDrill).map((e) => (
                <li key={e.item}>
                  <span>{e.item}</span>
                  <span className="nf-muted">
                    {e.blockCount} station{e.blockCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
            {unresolvedDrillIds(plan.blocks, resolveDrill).length > 0 && (
              <p className="nf-notice nf-no-print" role="alert">
                This plan references drills no longer in the catalog. Edit the plan to update them.
              </p>
            )}
          </section>

        </>
      )}
    </Workspace>
  );
}
