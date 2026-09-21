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
    ].some((p) => pathname.startsWith(p))
  )
    return null;
  return (
    <nav aria-label="Game-day workspace" className="nf-entry">
      <Link href="/coach/today">Ninety Feet · Open game-day workspace →</Link>
      <div className="nf-entry-links">
        <Link href="/coach/today">Today</Link>
        <Link href="/coach/insights">Review games</Link>
        <Link href="/coach/training">Practice</Link>
      </div>
    </nav>
  );
}
