"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function WorkspaceEntry() {
  const pathname = usePathname();
  if (
    pathname === "/coach/login" ||
    ["/coach/today", "/coach/team", "/coach/live", "/coach/training"].some(
      (p) => pathname.startsWith(p),
    )
  )
    return null;
  return (
    <nav aria-label="Game-day workspace" className="nf-entry">
      <Link href="/coach/today">Ninety Feet · Open game-day workspace →</Link>
      <span>Shared scoring, dugout display & player development</span>
    </nav>
  );
}
