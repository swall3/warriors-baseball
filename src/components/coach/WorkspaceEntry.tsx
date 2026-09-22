"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function WorkspaceEntry() {
  const pathname = usePathname();
  if (
    pathname === "/coach/login" ||
    [
      "/coach/today",
      "/coach/team",
      "/coach/live",
      "/coach/training",
      "/coach/insights",
      "/coach/dashboard",
      "/coach/stats",
      "/coach/intel",
      "/coach/import",
      "/coach/billing",
    ].some((p) => pathname.startsWith(p))
  )
    return null;
  return (
    <nav aria-label="Game-day workspace" className="nf-entry">
      {pathname.startsWith("/coach/legacy") && (
        <p>
          Legacy device-only tools · For previously saved local games. New
          shared games use Prepare.
        </p>
      )}
      <Link href="/coach/today">InningWise · Open game-day workspace →</Link>
      <div className="nf-entry-links">
        <Link href="/coach/today">Today</Link>
        <Link href="/coach/team">Manage team</Link>
        <Link href="/coach/live/new">Prepare game</Link>
        <Link href="/coach/insights">Review games</Link>
        <Link href="/coach/training">Practice</Link>
      </div>
    </nav>
  );
}
