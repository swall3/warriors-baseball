"use client";

import "../../practice.css";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PracticeRunner from "@/components/coach/PracticeRunner";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { DRILLS, type Drill } from "@/lib/practice/drills";
import type { TeamDrill } from "@/lib/practice/custom-drills";
import type { PracticeBlock } from "@/lib/practice/templates";

type Plan = { id: string; name: string; description: string; blocks: PracticeBlock[] };

export default function PracticeRunPage() {
  const params = useParams<{ planId: string }>();
  const { catalog, error: catalogError, retry } = useCatalog();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [drills, setDrills] = useState<Drill[]>(DRILLS);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/coach/practice/${encodeURIComponent(params.planId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setPlan(data.plan);
        setDrills([...DRILLS, ...((data.customDrills ?? []) as TeamDrill[])]);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught.message);
      });
    return () => controller.abort();
  }, [params.planId]);

  return (
    <Workspace catalog={catalog} active="Practice library" compact>
      <div className="nf-run-toolbar">
        <Link href={`/coach/practice/${params.planId}`}>← Exit run mode</Link>
        <span>Progress is saved on this device.</span>
      </div>
      {catalogError && <LoadError error={catalogError} retry={retry} />}
      {error && <LoadError error={error} retry={() => location.reload()} />}
      {!plan && !error && <p role="status">Loading practice…</p>}
      {plan && <PracticeRunner planId={plan.id} planName={plan.name} blocks={plan.blocks} drills={drills} />}
    </Workspace>
  );
}
