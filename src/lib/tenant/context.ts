// Tenant resolution — MULTI-TENANT-PLAN.md §1.2.
//
// EVERY tenant lookup in this application goes through getOrgContext(). Not
// through a cookie read in a component, not through a searchParams.get("org")
// in a route handler, not through a constant imported at a call site.
//
// The reason is §5.2: in MT-2 org identity was a constant, in MT-3 it is a
// signed session cookie carrying an org_id (§3.2), and if subdomains ever
// happen (acme.coachapp.io) it becomes a req.headers.host parse (§5.3c). Each
// of those has to be a ONE-FILE change rather than a hunt through 13 pages and
// 7 route handlers — which is what it would be if the constant below were
// imported directly by the call sites that need it.
//
// MT-3 is that argument cashing out. getOrgContext() went from `return
// { orgId: OWNER_ORG_ID }` to a cookie read and an HMAC verification, and not
// one call site changed. The plumbing was the point.

// The owner org — Stuart's. Tenant #1, seeded by migration 007.
//
// ⚠️ This id is duplicated in exactly one other place on purpose:
// supabase/migrations/013_rls_policies.sql's `public_signup_insert` policy,
// which hardcodes `org_id = 'org-outlaws'` because the public site is
// single-tenant by decision (§5.1). The two must agree, or the public tryout
// form starts failing every submission the moment the anon key is in use. A
// database policy cannot import a TypeScript constant, so the coupling is
// documented in both directions instead of pretended away.
//
// Env-overridable because §5.2 says this one *can* be — precisely because the
// public site is single-tenant. Nothing else about tenancy may be env-driven
// (§4.1: a process-global value cannot serve org A and org B differently).
export const OWNER_ORG_ID = process.env.OWNER_ORG_ID || "org-outlaws";

export type OrgRole = "owner" | "coach" | "viewer";

export type OrgContext = {
  orgId: string;
  // `userId` stays empty until MT-5: a passcode identifies an ORG and a ROLE,
  // never a person, which is the honest limit of the bridge (§3.2) and the
  // reason org_members stays unpopulated until real accounts exist (§2.2).
  userId?: string;
  // Populated as of MT-3 — it comes out of the signed session payload.
  role?: OrgRole;
};

// Resolves the organization this request belongs to.
//
// ✅ MT-3 BEHAVIOUR: reads the real org out of the verified session cookie.
// MT-2 returned the OWNER_ORG_ID constant, with the note that the plumbing was
// the point and the value was not. This is that note coming due: the function
// body changed, and — as designed — nothing downstream of it did. It was
// already async precisely so this day would not be an await-threading exercise
// through every caller.
//
// THROWS rather than returning null or falling back to OWNER_ORG_ID when there
// is no valid session. The fallback is the tempting option and it is the
// dangerous one: getOrgScope() feeds the org id straight into every Supabase
// query, so a silent default would serve one tenant's data to an unauthenticated
// request — T6's defect, in the single worst place to have it. Throwing is also
// safe in practice: middleware.ts has already rejected sessionless requests
// before any handler runs, and every /api/coach handler calls requireCoach()
// first, so a throw here means a bug in the gate rather than a user-reachable
// 500.
//
// The dynamic import breaks a module cycle rather than avoiding a cost: auth.ts
// imports OWNER_ORG_ID from this file (its legacy-cookie bridge resolves to the
// owner org), so a static import back would close the loop. Deferring it to
// call time is the same idiom auth.ts already uses for next/headers, and the
// function is async anyway.
export async function getOrgContext(): Promise<OrgContext> {
  const { requireCoach } = await import("@/lib/coach/auth");
  const session = await requireCoach();
  if (!session) {
    throw new NoOrgSessionError();
  }
  return { orgId: session.orgId, role: session.role, userId: session.userId };
}

// A NAMED error class, not a bare `new Error(...)`, because exactly one caller
// is allowed to catch this and it must be able to catch ONLY this.
//
// coach/layout.tsx wraps getOrgContext() so that /coach/login — which renders
// inside that layout with no session — does not 500. A broad `catch {}` there
// swallowed more than it should: Next throws its own control-flow error out of
// cookies() to bail out of static rendering, so the catch turned "this route
// must be dynamic" into "there is no session", and the coach pages prerendered
// into static HTML with no org in them. That was caught by the build rather
// than by a reviewer, which is the argument for this class existing.
export class NoOrgSessionError extends Error {
  constructor() {
    super("No coach session: cannot resolve an organization");
    this.name = "NoOrgSessionError";
  }
}

// The scope object src/lib/supabase.ts's shim functions require in argument
// position 1 (§3.4 Stage A).
//
// For a /api/coach handler, prefer `{ orgId: session.orgId }` from the
// requireCoach() the handler already performs — as of MT-3 all six do. This
// function re-resolves the session from scratch, which is correct but is a
// second cookie read and a second HMAC verification for an answer already
// sitting in scope. It remains for server components like
// coach/game/[gameId]/page.tsx, which are gated by middleware.ts and have no
// requireCoach() call of their own to take the org from.
export async function getOrgScope(): Promise<{ orgId: string }> {
  const { orgId } = await getOrgContext();
  return { orgId };
}
