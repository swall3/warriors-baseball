"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import GameDaySteps from "./GameDaySteps";
import InstallPrompt from "@/components/InstallPrompt";
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
function usePendingReviews(enabled: boolean, orgId?: string) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    setCount(null);
    let active = true;
    let latest = 0;
    const refresh = async () => {
      const request = ++latest;
      try {
        const response = await fetch("/api/coach/join?summary=1", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load reviews.");
        const data = await response.json();
        if (active && request === latest)
          setCount(typeof data.pendingCount === "number" ? data.pendingCount : null);
      } catch {
        if (active && request === latest) setCount(null);
      }
    };
    const onFocus = () => void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", onFocus);
    window.addEventListener("iw:reviews-changed", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("iw:reviews-changed", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, orgId]);
  return count;
}
export function Workspace({
  catalog,
  children,
  compact = false,
  gameStatus,
}: {
  catalog: Catalog | null;
  // Accepted for backward-compat with all callers, but no longer rendered:
  // the top `nf-nav` tabs were removed (they duplicated the game-day steps).
  // Active state now lives entirely in <GameDaySteps>, derived from pathname.
  active?: string;
  children: ReactNode;
  compact?: boolean;
  gameStatus?: string;
}) {
  const pathname = usePathname();
  const canReview = !!catalog?.personalAccount &&
    (!!catalog.canManageOrganization || catalog.role !== "viewer");
  const reviewCount = usePendingReviews(canReview, catalog?.organization.id);
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
        <div className="nf-top-right">
          <span>Game day &amp; player development</span>
          <Link href="/install#coaches" className="nf-account-link nf-install-header">Install</Link>
          {canReview && <Link href="/coach/access#join-requests"
            className={`nf-review-alert${reviewCount !== null && reviewCount > 0 ? " is-pending" : ""}`}
            aria-label={reviewCount !== null && reviewCount > 0
              ? `${reviewCount} ${reviewCount === 1 ? "request needs" : "requests need"} review`
              : "Review requests"}
            title="Review requests">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            {reviewCount !== null && reviewCount > 0 &&
              <span className="nf-review-count" aria-hidden="true">{reviewCount}</span>}
          </Link>}
          <Link href="/account" className="nf-account-link">
            Account
          </Link>
        </div>
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
        {!compact && (
          <GameDaySteps
            canPrepare={catalog?.role !== "viewer"}
            gameStatus={gameStatus}
          />
        )}
        {!compact && pathname === "/coach/today" && <InstallPrompt />}
        {!compact && pathname === "/coach/today" && reviewCount !== null && reviewCount > 0 && (
          <Link href="/coach/access#join-requests" className="nf-review-banner">
            <strong>{reviewCount} {reviewCount === 1 ? "request needs" : "requests need"} your review</strong>
            <span>Review now →</span>
          </Link>
        )}
        {children}
        <footer className="nf-footer">
          <Link href="/install#coaches">Install InningWise</Link>
          <Link href="/coach/team">Manage team</Link>
          <Link href="/coach/live/new">Prepare game</Link>
          <Link href="/coach/practice">Drill library</Link>
          <Link href="/coach/training">Player assignments</Link>
          {(!catalog?.personalAccount || catalog?.canManageOrganization) && (
            <Link href="/coach/import">Import games</Link>
          )}
          <Link href="/games">Learning games</Link>
          {catalog?.familyAccess && (
            <Link href="/coach/family">Family view</Link>
          )}
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
