"use client";
import Link from "next/link";
import GameDaySteps from "./GameDaySteps";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
export type Catalog = {
  orgRole?: "owner" | "manager" | "member";
  personalAccount?: boolean;
  familyAccess?: boolean;
  canManageOrganization?: boolean;
  organization: {
    id: string;
    name: string;
    short_name: string | null;
    branding: { colors?: { primary?: string; accent?: string } };
  };
  role: "owner" | "coach" | "viewer";
  teams: { id: string; name: string }[];
  players: {
    id: string;
    team_id: string;
    display_name: string;
    jersey_number: string | null;
  }[];
};
export function useCatalog() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach/catalog", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Unable to load your team.");
        setCatalog(data);
        setError("");
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  return { catalog, error, retry: () => setAttempt((x) => x + 1) };
}
export function Workspace({
  catalog,
  active,
  children,
  compact = false,
  gameStatus,
}: {
  catalog: Catalog | null;
  active: string;
  children: ReactNode;
  compact?: boolean;
  gameStatus?: string;
}) {
  const color = catalog?.organization.branding?.colors?.primary;
  const style = {
    "--nf-team": color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#0f2044",
  } as CSSProperties;
  return (
    <div
      className={`nf-workspace${compact ? " nf-live-workspace" : ""}`}
      style={style}
    >
      <header className="nf-top">
        <Link href="/coach/today" className="nf-wordmark">
          InningWise <span>/</span>
        </Link>
        <span>Game day & player development</span>
      </header>
      <main className="nf-main">
        <div className="nf-identity">
          <div className="nf-badge">
            {(
              catalog?.organization.short_name ??
              catalog?.organization.name ??
              "Team"
            )
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p className="nf-eyebrow">YOUR ORGANIZATION</p>
            <h1>
              {catalog?.organization.short_name ??
                catalog?.organization.name ??
                "Your dugout"}
            </h1>
          </div>
          <span className="nf-role">
            {catalog?.orgRole === "manager"
              ? "Organization manager"
              : catalog?.orgRole === "owner"
                ? "Organization owner"
                : (catalog?.role ?? "Loading")}
          </span>
        </div>
        <nav className="nf-nav" aria-label="Coach navigation">
          {[
            ["Today", "/coach/today"],
            ["Team", "/coach/team"],
            ["Review", "/coach/insights"],
            ["Practice", "/coach/training"],
          ].map(([name, href]) => (
            <Link
              key={name}
              href={href}
              aria-current={
                (active === "Insights"
                  ? "Review"
                  : active === "Play & Learn"
                    ? "Practice"
                    : active) === name
                  ? "page"
                  : undefined
              }
            >
              {name}
            </Link>
          ))}
        </nav>
        {!compact && (
          <GameDaySteps
            canPrepare={catalog?.role !== "viewer"}
            gameStatus={gameStatus}
          />
        )}
        {children}
        <footer className="nf-footer">
          <Link href="/coach/team">Manage team</Link>
          <Link href="/coach/live/new">Prepare game</Link>
          {(!catalog?.personalAccount || catalog?.canManageOrganization) && (
            <Link href="/coach/import">Import games</Link>
          )}
          <Link href="/games">Public training games</Link>
          <Link href="/coach/billing">Team billing</Link>
          <Link href="/coach/access">People & access</Link>
          {catalog?.familyAccess && (
            <Link href="/coach/family">Family view</Link>
          )}
          <Link href="/account">My account</Link>
        </footer>
      </main>
    </div>
  );
}
export function LoadError({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div className="nf-notice" role="alert">
      <p>{error}</p>
      <button onClick={retry}>Try again</button>
    </div>
  );
}
