"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Workspace, useCatalog, LoadError } from "./Workspace";
export default function AnalyticsWorkspace({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const { catalog, error, retry } = useCatalog();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <Workspace catalog={catalog} active="Review">
      <section className="nf-intro">
        <p className="nf-eyebrow">REVIEW / HISTORICAL GAMES</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </section>
      {error && <LoadError error={error} retry={retry} />}
      <nav className="nf-report-nav" aria-label="Historical reports">
        {[
          ["Team overview", "/coach/dashboard"],
          ["Spray charts", "/coach/stats"],
          ["Opponent tendencies", "/coach/intel"],
          ["Import games", "/coach/import"],
        ].map(([label, href]) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      <p className="nf-report-source">
        Imported and older device-only games.{" "}
        <Link href="/coach/insights">Open shared-game reviews →</Link>
      </p>
      <div className="nf-analytics">{mounted ? children : <p role="status">Loading reports…</p>}</div>
    </Workspace>
  );
}
