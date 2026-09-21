// Tenant resolution — MULTI-TENANT-PLAN.md §1.2.
//
// EVERY tenant lookup in this application goes through getOrgContext(). Not
// through a cookie read in a component, not through a searchParams.get("org")
// in a route handler, not through a constant imported at a call site.
//
// The reason is §5.2, and it is worth stating plainly because the function
// currently looks too trivial to deserve its own module: today org identity
// comes from a single-tenant deployment. In MT-3 it comes from a signed
// session cookie carrying an org_id (§3.2). If subdomains ever happen
// (acme.coachapp.io), it becomes a req.headers.host parse (§5.3c). Each of
// those has to be a ONE-FILE change rather than a hunt through 13 pages and 7
// route handlers — which is what it would be if the constant below were
// imported directly by the call sites that need it.
//
// That is the entire argument. The plumbing is the point; the value it
// currently returns is not.

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
  // Populated in MT-3, when the session cookie starts carrying a real
  // identity (§3.2) and requireCoach() returns a CoachSession rather than a
  // boolean (T5). Optional rather than absent so the MT-3 change adds a value
  // instead of changing this type's shape and every destructuring of it.
  userId?: string;
  role?: OrgRole;
};

// Resolves the organization this request belongs to.
//
// ⚠️ MT-2 BEHAVIOUR: returns a constant. There is exactly one organization,
// and the passcode gate (auth.ts) proves only that "someone knows the
// passcode" — it carries no identity to resolve an org from (T5). Inventing a
// resolution mechanism before there is anything to resolve would be building
// MT-3's session design a phase early and without its migration.
//
// It is async, and returns a Promise it does not need to, deliberately: MT-3's
// implementation reads cookies() and verifies an HMAC, both async. Making the
// signature async now means MT-3 changes this function's body and nothing
// else. A sync signature here would make MT-3 an await-threading exercise
// through every caller — the exact hunt-through-13-files this module exists to
// prevent.
//
// Never returns null in MT-2. The `| null` in the plan's §1.2 sketch is MT-3's
// shape, for a request whose session cookie is missing or forged; today the
// middleware gate has already rejected that request before any handler runs.
export async function getOrgContext(): Promise<OrgContext> {
  return { orgId: OWNER_ORG_ID };
}

// The scope object src/lib/supabase.ts's shim functions require in argument
// position 1 (§3.4 Stage A). Sugar for the overwhelmingly common
// `const { orgId } = await getOrgContext()` at the top of a handler.
export async function getOrgScope(): Promise<{ orgId: string }> {
  const { orgId } = await getOrgContext();
  return { orgId };
}
