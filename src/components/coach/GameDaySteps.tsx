"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function GameDaySteps({
  canPrepare = true,
  gameStatus,
}: {
  canPrepare?: boolean;
  gameStatus?: string;
}) {
  const path = usePathname();
  const match = path.match(/^\/coach\/live\/([^/]+)/);
  const gameId = match && match[1] !== "new" ? match[1] : null;
  const stage =
    ["/coach/team", "/coach/access", "/coach/billing"].some((route) =>
      path.startsWith(route),
    )
      ? null
      : gameStatus === "ready"
      ? "Prepare"
      : gameStatus === "final"
        ? "Review"
        : path.includes("/insights") || ["/coach/dashboard", "/coach/stats", "/coach/intel", "/coach/import"].includes(path)
          ? "Review"
          : path === "/coach/training" || path.startsWith("/coach/practice")
            ? "Practice"
            : path === "/coach/live/new"
              ? "Prepare"
              : gameId
                ? "Play"
                : "Today";
  const steps = [
    ["Today", "/coach/today", "Find your game"],
    ...(canPrepare
      ? [["Prepare", "/coach/live/new", "Set lineup & crew"]]
      : []),
    [
      "Play",
      gameId ? `/coach/live/${gameId}` : "/coach/today#games",
      "Score & follow along",
    ],
    [
      "Review",
      gameId ? `/coach/live/${gameId}/insights` : "/coach/insights",
      "See what happened",
    ],
    ["Practice", canPrepare ? "/coach/practice" : "/coach/training", "Build the next skill"],
  ];
  return (
    <nav className="nf-steps" aria-label="Game-day steps">
      {steps.map(([label, href, detail], i) => (
        <Link
          key={label}
          href={href}
          aria-current={stage === label ? "step" : undefined}
        >
          <span>{i + 1}</span>
          <div>
            <strong>{label}</strong>
            <small>{detail}</small>
          </div>
        </Link>
      ))}
    </nav>
  );
}
