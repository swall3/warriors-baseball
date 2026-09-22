"use client";
import "../practice.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { DRILLS, DRILL_CATEGORIES, type DrillCategory } from "@/lib/practice/drills";
import { getPracticeTemplate } from "@/lib/practice/templates";
import type { PracticeBlock } from "@/lib/practice/templates";
import { aggregateEquipment, totalPlanDuration } from "@/lib/practice/aggregate";

function newBlock(): PracticeBlock {
  return { id: crypto.randomUUID(), label: "New station", durationMinutes: 15, drillIds: [] };
}

export default function PracticeBuilder() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const params = useSearchParams();
  const router = useRouter();
  const templateId = params.get("template");
  const editId = params.get("edit");

  const [teamId, setTeamId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [blocks, setBlocks] = useState<PracticeBlock[]>([newBlock()]);
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null);
  const [category, setCategory] = useState<DrillCategory | "all">("all");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedEdit, setLoadedEdit] = useState(!editId);

  useEffect(() => {
    if (!catalog) return;
    if (!teamId && catalog.teams[0]) setTeamId(catalog.teams[0].id);
  }, [catalog, teamId]);

  useEffect(() => {
    if (!templateId) return;
    const template = getPracticeTemplate(templateId);
    if (!template) {
      setError("That practice template was not found.");
      return;
    }
    setName(template.name);
    setDescription(template.description);
    setSourceTemplateId(template.id);
    setBlocks(template.blocks.map((b) => ({ ...b, id: crypto.randomUUID() })));
  }, [templateId]);

  useEffect(() => {
    if (!editId) return;
    const controller = new AbortController();
    fetch(`/api/coach/practice/${editId}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setTeamId(d.plan.team_id);
        setName(d.plan.name);
        setDescription(d.plan.description);
        setSourceTemplateId(d.plan.source_template_id);
        setBlocks(d.plan.blocks);
        setLoadedEdit(true);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [editId]);

  const shownDrills = useMemo(
    () => (category === "all" ? DRILLS : DRILLS.filter((d) => d.category === category)),
    [category],
  );
  const equipment = useMemo(() => aggregateEquipment(blocks), [blocks]);
  const totalMinutes = useMemo(() => totalPlanDuration(blocks), [blocks]);
  const emptyBlocks = blocks.filter((b) => b.drillIds.length === 0);

  function updateBlock(id: string, patch: Partial<PracticeBlock>) {
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function toggleDrill(blockId: string, drillId: string) {
    setBlocks((bs) =>
      bs.map((b) =>
        b.id === blockId
          ? {
              ...b,
              drillIds: b.drillIds.includes(drillId)
                ? b.drillIds.filter((d) => d !== drillId)
                : [...b.drillIds, drillId],
            }
          : b,
      ),
    );
  }
  function removeBlock(id: string) {
    setBlocks((bs) => (bs.length > 1 ? bs.filter((b) => b.id !== id) : bs));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const body = { teamId, name, description, sourceTemplateId, blocks };
      const url = editId ? `/api/coach/practice/${editId}` : "/api/coach/practice";
      const method = editId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      router.push(`/coach/practice/${d.plan.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (catalog && catalog.role === "viewer")
    return (
      <Workspace catalog={catalog} active="Practice library">
        <p className="nf-card">Only a coach can build a practice plan.</p>
      </Workspace>
    );

  return (
    <Workspace catalog={catalog} active="Practice library">
      <section className="nf-intro">
        <p className="nf-eyebrow">{editId ? "EDIT PRACTICE PLAN" : "NEW PRACTICE PLAN"}</p>
        <h2>{editId ? "Update this plan." : "Build a practice, station by station."}</h2>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      {error && <p className="nf-notice" role="alert">{error}</p>}
      {!loadedEdit ? (
        <p role="status">Loading plan…</p>
      ) : (
        <>
          <section className="nf-card nf-section">
            <label className="nf-label">
              Team
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {catalog?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="nf-label">
              Plan name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="nf-label">
              Description
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </section>

          <section className="nf-card nf-section">
            <h3>Stations</h3>
            {blocks.map((block) => (
              <div className="nf-station" key={block.id}>
                <div className="nf-station-head">
                  <input
                    value={block.label}
                    onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                    aria-label="Station name"
                  />
                  <input
                    type="number"
                    min={1}
                    value={block.durationMinutes}
                    onChange={(e) =>
                      updateBlock(block.id, { durationMinutes: Number(e.target.value) || 0 })
                    }
                    aria-label="Station duration in minutes"
                  />
                  <span className="nf-muted">min</span>
                  <button
                    className="nf-secondary"
                    onClick={() => removeBlock(block.id)}
                    disabled={blocks.length <= 1}
                  >
                    Remove station
                  </button>
                </div>
                <label className="nf-label">
                  Filter drills by category
                  <select value={category} onChange={(e) => setCategory(e.target.value as DrillCategory | "all")}>
                    <option value="all">All categories</option>
                    {DRILL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="nf-drill-picker">
                  {shownDrills.map((d) => (
                    <label key={d.id}>
                      <input
                        type="checkbox"
                        checked={block.drillIds.includes(d.id)}
                        onChange={() => toggleDrill(block.id, d.id)}
                      />
                      {d.name} ({d.durationMinutes} min · {d.category})
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button onClick={() => setBlocks((bs) => [...bs, newBlock()])}>
              + Add station
            </button>
          </section>

          <section className="nf-card nf-section">
            <h3>Plan summary</h3>
            <p>
              {blocks.length} station{blocks.length === 1 ? "" : "s"} · {totalMinutes} min
              planned total
            </p>
            <h4>Equipment checklist</h4>
            {!equipment.length && <p className="nf-muted">Add drills to see equipment needs.</p>}
            <ul className="nf-equipment-list">
              {equipment.map((e) => (
                <li key={e.item}>
                  <span>{e.item}</span>
                  <span className="nf-muted">
                    {e.blockCount} station{e.blockCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {emptyBlocks.length > 0 && (
            <p className="nf-notice" role="alert">
              Every station needs at least one drill before you can save. Empty:{" "}
              {emptyBlocks.map((b) => b.label).join(", ")}
            </p>
          )}
          <button
            className="nf-button"
            disabled={saving || !name.trim() || !teamId || emptyBlocks.length > 0}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : editId ? "Save changes" : "Save practice plan"}
          </button>
        </>
      )}
    </Workspace>
  );
}
