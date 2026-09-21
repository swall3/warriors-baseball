// Shell for the coach ("Field") surface.
//
// This layout is what finally wires up coach.css. Before it existed, the
// stylesheet was imported nowhere, so `.coach-theme` never applied and the
// coach pages were dark purely because of the Tailwind utilities baked into
// their JSX. The light pass therefore had to change both: the stylesheet
// (tokens, here) and the utilities (per page).
//
// The `.dugout-theme` wrapper carries the --d-* tokens and the page
// background. Keeping it on a wrapper div rather than on <body> is deliberate
// — it is what stops the coach palette from leaking onto the public Warriors
// site or the /games hub, which share the same root layout.
import type { Metadata } from "next";
import { team } from "@/lib/brand-config";
import "./coach.css";

export const metadata: Metadata = {
  title: `${team.name} Coach`,
  // Coach screens are a private tool; keep them out of search results.
  robots: { index: false, follow: false },
};

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return <div className="dugout-theme min-h-screen">{children}</div>;
}
