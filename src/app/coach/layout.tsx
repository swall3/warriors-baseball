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
import { getCoachBrand } from "@/lib/coach/org-brand";
import type { Metadata } from "next";
import WorkspaceEntry from "@/components/coach/WorkspaceEntry";
import { CoachOrgProvider } from "@/lib/coach/org-client";
import {
  NoOrgSessionError,
  OWNER_ORG_ID,
  getOrgContext,
} from "@/lib/tenant/context";
import "./coach.css";
import "./workspace.css";

// Every /coach route renders per-request, never prerendered.
//
// Not a performance knob — a correctness one. This layout now puts an ORG ID
// into the HTML, and a statically generated shell would bake ONE tenant's org
// id into a file served to every tenant. The pages are gated, uncacheable and
// entirely client-rendered anyway, so there is nothing to lose and a
// cross-tenant mix-up to avoid.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  let orgId: string | null = null;
  try {
    orgId = (await getOrgContext()).orgId;
  } catch (error) {
    if (!(error instanceof NoOrgSessionError)) throw error;
  }
  const brand = await getCoachBrand(orgId);
  return {
    title: orgId ? `${brand.name} · InningWise` : "Team sign-in · InningWise",
    robots: { index: false, follow: false },
  };
}

// MT-3: this is also where the client learns which tenant it is rendering for.
// The layout is the right place because it is the one server component every
// coach screen passes through, and because a value put here lands in the
// server-rendered HTML — available to client components synchronously on their
// first render, which storage-keys.ts's ORDERING note explains is a data-safety
// requirement and not a performance preference.
//
// The try/catch is load-bearing: /coach/login renders INSIDE this layout, and
// by definition has no session yet. getOrgContext() throws in that case (it
// refuses to guess an org), so without this, the login page — the one page a
// locked-out coach needs — would 500. A null org is the honest answer for it,
// and useCoachStorageKeys() throws if any other page somehow reaches storage
// with one.
//
// It catches NoOrgSessionError SPECIFICALLY and rethrows everything else. A
// bare `catch {}` here also swallowed the control-flow error Next throws out of
// cookies() to bail out of static rendering, which silently prerendered these
// pages with no org in them; the build failed on it. Narrow catches around
// framework calls, always.
export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let orgId: string | null = null;
  let userId: string | undefined;
  try {
    const context = await getOrgContext();
    orgId = context.orgId;
    userId = context.userId;
  } catch (e) {
    if (!(e instanceof NoOrgSessionError)) throw e;
    orgId = null;
  }

  const brand = await getCoachBrand(orgId);
  return (
    <CoachOrgProvider
      value={{ orgId, userId, isOwnerOrg: orgId === OWNER_ORG_ID, brand }}
    >
      <div className="dugout-theme min-h-screen">
        <WorkspaceEntry />
        {children}
      </div>
    </CoachOrgProvider>
  );
}
