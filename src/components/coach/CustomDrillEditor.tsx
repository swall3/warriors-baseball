"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Workspace, useCatalog, LoadError } from "./Workspace";
import {
  AGE_BANDS,
  DRILL_CATEGORIES,
  EQUIPMENT_ITEMS,
  type AgeBand,
  type DrillCategory,
  type EquipmentItem,
  type ScenarioCategory,
} from "@/lib/practice/drills";
import type { FieldZone as FieldPosition } from "@/lib/scenarioTypes";

const POSITIONS: FieldPosition[] = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
const SITUATIONS: { value: ScenarioCategory; label: string }[] = [
  { value: "cover", label: "Coverage" },
  { value: "backup", label: "Backup responsibility" },
  { value: "relay", label: "Relay / where to throw" },
  { value: "miss-recovery", label: "Missed-ball recovery" },
];

type FormState = {
  teamId: string;
  name: string;
  category: DrillCategory;
  positions: FieldPosition[];
  ageBands: AgeBand[];
  durationMinutes: number;
  players: string;
  space: string;
  equipment: EquipmentItem[];
  setup: string;
  instructions: string[];
  coachingCue: string;
  scenarioCategory: ScenarioCategory | "";
};

const EMPTY: FormState = {
  teamId: "",
  name: "",
  category: "infield",
  positions: [],
  ageBands: ["9U"],
  durationMinutes: 10,
  players: "",
  space: "",
  equipment: ["balls"],
  setup: "",
  instructions: [""],
  coachingCue: "",
  scenarioCategory: "",
};

function toggle<T>(items: T[], value: T) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

export default function CustomDrillEditor({ drillId }: { drillId?: string }) {
  const router = useRouter();
  const { catalog, error: catalogError, retry } = useCatalog();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!drillId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!catalog || form.teamId) return;
    setForm((current) => ({ ...current, teamId: catalog.teams[0]?.id ?? "" }));
  }, [catalog, form.teamId]);

  useEffect(() => {
    if (!drillId) return;
    const controller = new AbortController();
    fetch(`/api/coach/practice/drills/${encodeURIComponent(drillId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const drill = data.drill;
        setForm({
          teamId: drill.teamId,
          name: drill.name,
          category: drill.category,
          positions: drill.positions,
          ageBands: drill.ageBands,
          durationMinutes: drill.durationMinutes,
          players: drill.players,
          space: drill.space,
          equipment: drill.equipment,
          setup: drill.setup,
          instructions: drill.instructions,
          coachingCue: drill.coachingCue ?? "",
          scenarioCategory: drill.scenarioCategory ?? "",
        });
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [drillId]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        drillId
          ? `/api/coach/practice/drills/${encodeURIComponent(drillId)}`
          : "/api/coach/practice/drills",
        {
          method: drillId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
          signal: AbortSignal.timeout(10000),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push("/coach/practice");
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  if (catalog && catalog.role === "viewer")
    return (
      <Workspace catalog={catalog} active="Practice library">
        <p className="nf-card">Only a coach can create or edit a team drill.</p>
      </Workspace>
    );

  return (
    <Workspace catalog={catalog} active="Practice library">
      <section className="nf-intro">
        <p className="nf-eyebrow">{drillId ? "EDIT TEAM DRILL" : "NEW TEAM DRILL"}</p>
        <h2>{drillId ? "Tune the drill your team uses." : "Write it once. Reuse it every practice."}</h2>
        <p>Team drills stay private to this organization and can be added to any saved practice plan.</p>
      </section>
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      {error && <p className="nf-notice" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading drill…</p>
      ) : (
        <div className="nf-form-stack">
          <section className="nf-card nf-section">
            <div className="nf-form-grid">
              <label className="nf-label">Team
                <select
                  value={form.teamId}
                  disabled={!!drillId}
                  onChange={(event) => setForm({ ...form, teamId: event.target.value })}
                >
                  {catalog?.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label className="nf-label">Drill name
                <input value={form.name} maxLength={160} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </label>
              <label className="nf-label">Category
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as DrillCategory })}>
                  {DRILL_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
              <label className="nf-label">Minutes
                <input type="number" min={1} max={60} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} />
              </label>
              <label className="nf-label">Players / groups
                <input value={form.players} placeholder="Example: 1 coach, 6 infielders" onChange={(event) => setForm({ ...form, players: event.target.value })} />
              </label>
              <label className="nf-label">Space
                <input value={form.space} placeholder="Example: Half infield" onChange={(event) => setForm({ ...form, space: event.target.value })} />
              </label>
            </div>
            <fieldset className="nf-option-group">
              <legend>Positions <span className="nf-muted">(leave blank for whole team)</span></legend>
              <div className="nf-chip-options">
                {POSITIONS.map((position) => (
                  <label key={position}><input type="checkbox" checked={form.positions.includes(position)} onChange={() => setForm({ ...form, positions: toggle(form.positions, position) })} />{position}</label>
                ))}
              </div>
            </fieldset>
            <fieldset className="nf-option-group">
              <legend>Age groups</legend>
              <div className="nf-chip-options">
                {AGE_BANDS.map((age) => (
                  <label key={age}><input type="checkbox" checked={form.ageBands.includes(age)} onChange={() => setForm({ ...form, ageBands: toggle(form.ageBands, age) })} />{age}</label>
                ))}
              </div>
            </fieldset>
            <fieldset className="nf-option-group">
              <legend>Equipment</legend>
              <div className="nf-chip-options">
                {EQUIPMENT_ITEMS.map((item) => (
                  <label key={item}><input type="checkbox" checked={form.equipment.includes(item)} onChange={() => setForm({ ...form, equipment: toggle(form.equipment, item) })} />{item}</label>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="nf-card nf-section">
            <label className="nf-label nf-wide-label">Setup
              <textarea rows={4} value={form.setup} onChange={(event) => setForm({ ...form, setup: event.target.value })} />
            </label>
            <div className="nf-instruction-list">
              <h3>Instructions</h3>
              {form.instructions.map((instruction, index) => (
                <div className="nf-instruction-row" key={index}>
                  <span aria-hidden>{index + 1}</span>
                  <textarea
                    rows={2}
                    aria-label={`Instruction ${index + 1}`}
                    value={instruction}
                    onChange={(event) => setForm({ ...form, instructions: form.instructions.map((step, stepIndex) => stepIndex === index ? event.target.value : step) })}
                  />
                  <button type="button" className="nf-secondary" disabled={form.instructions.length === 1} onClick={() => setForm({ ...form, instructions: form.instructions.filter((_, stepIndex) => stepIndex !== index) })}>Remove</button>
                </div>
              ))}
              <button type="button" className="nf-secondary" disabled={form.instructions.length >= 12} onClick={() => setForm({ ...form, instructions: [...form.instructions, ""] })}>+ Add step</button>
            </div>
            <div className="nf-form-grid nf-section">
              <label className="nf-label">Game-situation focus
                <select value={form.scenarioCategory} onChange={(event) => setForm({ ...form, scenarioCategory: event.target.value as ScenarioCategory | "" })}>
                  <option value="">General skill</option>
                  {SITUATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
              <label className="nf-label">Coaching cue <span className="nf-muted">(optional)</span>
                <input value={form.coachingCue} maxLength={500} placeholder="The one phrase players should remember" onChange={(event) => setForm({ ...form, coachingCue: event.target.value })} />
              </label>
            </div>
          </section>
          <div className="nf-action-row">
            <button type="button" className="nf-secondary" onClick={() => router.push("/coach/practice")}>Cancel</button>
            <button type="button" disabled={saving || !form.teamId || !form.name.trim()} onClick={() => void save()}>{saving ? "Saving…" : drillId ? "Save drill" : "Create team drill"}</button>
          </div>
        </div>
      )}
    </Workspace>
  );
}
