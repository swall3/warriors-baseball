// The /coach gate. Runs in both edge (middleware) and node (route) runtimes.
// This is a lightweight gate for a coaching tool, not a full auth system —
// real accounts are MT-5 (MULTI-TENANT-PLAN §3.3), deliberately deferred.
//
// Ported from outlaws-field-app/src/lib/auth.ts during the /coach merge, with
// one deliberate security fix: this version fails CLOSED. The original
// defaulted an unset APP_PASSCODE to the literal string "outlaws" — a real
// hole (anyone could log in with the well-known default). Here, an unset
// APP_PASSCODE means nobody can pass the gate until it's configured.
// (MERGE-PLAN B7. Do not regress it; nothing below does.)
//
// ---------------------------------------------------------------------------
// MT-3: the gate now answers WHO, not just WHETHER
// ---------------------------------------------------------------------------
// requireCoach() used to return a boolean, because a valid cookie said only
// "someone knows the passcode" — which, under multi-tenancy, is not a statement
// about which data they may see (§3.1). It now returns a CoachSession carrying
// an orgId, or null (T5, §3.2).
//
// TWO COOKIES ARE ACCEPTED, and the second one is not legacy cruft:
//
//   1. ec_coach_session — the signed payload (session.ts). The real thing.
//   2. ec_coach_auth    — the MT-2 hash cookie, accepted ONLY as org-outlaws.
//
// (2) exists because Stuart's phone is carrying a live (1)-less cookie right
// now, with a 30-day max-age, and this branch deploys into the middle of a
// baseball season. Without the bridge, the deploy silently logs him out
// mid-game — which is precisely the class of "observable change" MT-3's gate
// forbids. It is not a weakening: that cookie is still sha256(salt:passcode)
// checked against APP_PASSCODE exactly as before, it still fails closed when
// APP_PASSCODE is unset, and it can resolve to ONE org (the owner's) and no
// other. A forged ec_coach_auth buys exactly what it bought yesterday.
//
// Delete the bridge once Stuart has logged in again post-deploy — the cookies
// are independent, so removing it costs one re-login and nothing else.

// The MT-2 hash cookie. Kept under its original name — and the MT-3 cookie
// given a DIFFERENT one (session.ts's SESSION_COOKIE) rather than reusing this
// one — so a browser can hold both during the transition and neither read path
// ever has to guess which format the value in front of it is.
import { OWNER_ORG_ID } from "@/lib/tenant/context";
import {
  SESSION_COOKIE,
  getSessionSecret,
  verifySession,
  type CoachSession,
} from "@/lib/coach/session";

export type { CoachSession };

export const AUTH_COOKIE = "ec_coach_auth";
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Generic salt (no longer team-specific) mixed into the hash. It only needs
// to be a fixed, non-secret string — it exists so the hash isn't a bare
// SHA-256 of the passcode alone.
const AUTH_SALT = "ec-coach-auth";

// Returns null when APP_PASSCODE is unset/empty — callers must treat that as
// "deny everyone," not fall back to a guessable default.
export function getPasscode(): string | null {
  const passcode = process.env.APP_PASSCODE;
  return passcode && passcode.length > 0 ? passcode : null;
}

// SHA-256 → hex, using Web Crypto (available in both edge and node runtimes).
export async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`${AUTH_SALT}:${passcode}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Returns null when no passcode is configured. A null expected token can
// never equal a cookie value, so this fails closed rather than open.
export async function expectedToken(): Promise<string | null> {
  const passcode = getPasscode();
  if (!passcode) return null;
  return hashPasscode(passcode);
}

// ---------------------------------------------------------------------------
// Session resolution — the one place either cookie is turned into an identity
// ---------------------------------------------------------------------------
// Takes a cookie READER rather than reading cookies itself, because its two
// callers get cookies from different places and neither can use the other's
// mechanism: middleware.ts has a NextRequest (and runs at the edge, where
// next/headers is not available), route handlers have next/headers (and have
// no request object in scope). One function, two adapters, so the edge gate and
// the handler gate can never drift into disagreeing about who is logged in.
//
// Order is signed-first. A browser mid-transition holds both cookies; the
// signed one is the authoritative statement of org, and letting the legacy
// bridge win would pin such a browser to org-outlaws even after its owner
// logged into a different tenant.
export async function resolveCoachSession(
  getCookie: (name: string) => string | undefined,
): Promise<CoachSession | null> {
  const signed = await verifySession(getCookie(SESSION_COOKIE), getSessionSecret());
  if (signed) return { orgId: signed.orgId, role: signed.role };

  // The MT-2 bridge. Fails closed through expectedToken() (null APP_PASSCODE
  // can never equal a cookie value), and hardcodes the owner org because that
  // is the only org this cookie format could ever have meant — it was minted
  // when there was exactly one tenant.
  const expected = await expectedToken();
  const legacy = getCookie(AUTH_COOKIE);
  if (expected && legacy && legacy === expected) {
    return { orgId: OWNER_ORG_ID, role: "owner" };
  }

  return null;
}

// Defense-in-depth for /api/coach/* route handlers: middleware.ts already
// gates the whole /api/coach/:path* tree, but this lets each handler verify
// independently rather than relying solely on the matcher never being
// edited. Reads the cookie via next/headers, so no request object is needed
// at the call site.
//
// Returns the SESSION, not a boolean (T5, §3.2). Every call site already had
// the shape `if (!(await requireCoach())) return 401`, so the guard reads
// identically — and the org the handler must scope its queries to is now in
// hand at the top of the function instead of being a constant imported from
// somewhere else and hoped to be right.
export async function requireCoach(): Promise<CoachSession | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return resolveCoachSession((name) => store.get(name)?.value);
}
