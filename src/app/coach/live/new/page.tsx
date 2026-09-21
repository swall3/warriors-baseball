"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { GamePreparation } from "@/components/coach/GamePreparation";
export default function NewGame() {
  const { catalog, error, retry } = useCatalog();
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <Workspace catalog={catalog} active="Games">
      <section className="nf-intro">
        <p className="nf-eyebrow">PREGAME</p>
        <h2>Set everyone up for a good game.</h2>
      </section>
      {error && <LoadError error={error} retry={retry} />}{" "}
      {catalog?.role === "viewer" ? (
        <p className="nf-notice">
          A coach prepares the game. Ask for your recording link when it is
          ready.
        </p>
      ) : (
        catalog && (
          <GamePreparation
            catalog={catalog}
            busy={busy}
            onSave={async (config) => {
              setBusy(true);
              try {
                const response = await fetch("/api/coach/live", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ config }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                router.push(`/coach/live/${data.game.id}`);
              } finally {
                setBusy(false);
              }
            }}
          />
        )
      )}
    </Workspace>
  );
}
