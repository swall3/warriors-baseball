// The signed session cookie — MULTI-TENANT-PLAN.md §3.2, phase MT-3.
//
//   ec_coach_session = base64url({orgId, role, iat, exp}) + "." + base64url(HMAC-SHA256(SESSION_SECRET, payload))
//
// WHY A SIGNATURE AT ALL. The MT-2 cookie is sha256('ec-coach-auth:' + passcode)
// — a bare value with no integrity binding. That was adequate while the cookie
// said only "someone knows the passcode", because the only thing a forger could
// forge was a claim that was true of everyone. The moment the cookie carries an
// ORG, an unsigned cookie is a tenancy bypass you can type by hand: set
// ec_coach_auth to whatever and read another club's roster. The HMAC is what
// makes orgId a claim the server issued rather than a claim the client asserts.
//
// WHY WEB CRYPTO, not node:crypto. src/middleware.ts runs in the EDGE runtime,
// where node:crypto is unavailable, and it has to verify this cookie before it
// can decide whether to let the request through. crypto.subtle is present in
// both runtimes — which is why auth.ts:31 already hashes with it. Same reason,
// one layer up.
//
// THIS MODULE IMPORTS NOTHING. No React, no next/*, no org constants. That is
// deliberate twice over: it keeps the module edge-safe, and it lets
// scripts/verify-mt3.mjs import it directly and test sign/verify/tamper/expiry
// as plain functions in plain node, with no server running and no build step.

export const SESSION_COOKIE = "ec_coach_session";

export type OrgRole = "owner" | "coach" | "viewer";

// What a caller gets back. Deliberately NOT the whole payload: iat/exp are the
// cookie's business, not the route handler's, and a handler that can see `exp`
// eventually grows logic that depends on it.
export type CoachSession = { orgId: string; role: OrgRole };

// What actually goes in the cookie. Seconds, not milliseconds — JWT convention,
// and this shape is deliberately JWT-adjacent so that MT-5's move to a real
// Supabase Auth token is a swap of the issuer rather than a reshaping of every
// consumer (§3.3).
export type SessionPayload = CoachSession & { iat: number; exp: number };

const ROLES: readonly string[] = ["owner", "coach", "viewer"];

// Returns null when SESSION_SECRET is unset/empty. Callers MUST treat that as
// "cannot mint, cannot verify" — never as "skip the check". Same fail-closed
// contract as getPasscode() in auth.ts:23, for the same reason.
export function getSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

// ---------------------------------------------------------------------------
// base64url
// ---------------------------------------------------------------------------
// Hand-rolled rather than Buffer.from(...).toString("base64url"): Buffer does
// not exist in the edge runtime. btoa/atob do, in both.

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message),
  );
  return new Uint8Array(sig);
}

// Length-independent, content-constant-time comparison.
//
// Not because a timing attack on a session cookie is likely — it is a remote
// attack against a 32-byte HMAC over a network, which is close to hopeless —
// but because `a === b` on secrets is the kind of line that gets copied into a
// place where it does matter, and writing it correctly once costs four lines.
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------
// `maxAgeSeconds` defaults at the call site (login route passes COOKIE_MAX_AGE,
// the 30 days auth.ts:14 has always used). Shortening it would log Stuart out
// sooner than today, which is an observable behaviour change and therefore
// fails MT-3's gate — so the default here matches rather than "improves".
export async function signSession(
  session: CoachSession,
  secret: string,
  maxAgeSeconds: number,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: SessionPayload = {
    orgId: session.orgId,
    role: session.role,
    iat: now,
    exp: now + maxAgeSeconds,
  };
  const encoded = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const signature = toBase64Url(await hmac(secret, encoded));
  return `${encoded}.${signature}`;
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------
// Returns null for every failure mode — bad shape, bad signature, expired,
// unknown role, missing orgId — and never throws. A route handler asking "is
// this session valid" must not have to distinguish "forged" from "malformed";
// both are "no", and a thrown error on a malformed cookie would turn a garbage
// cookie into a 500 instead of a redirect to the login page.
//
// Order matters: the signature is checked BEFORE the payload is parsed for
// anything but shape, so unsigned attacker-controlled JSON never reaches any
// logic that acts on it.
export async function verifySession(
  token: string | undefined | null,
  secret: string | null,
  now: number = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
  if (!token || !secret) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const expected = toBase64Url(await hmac(secret, encoded));
  if (!timingSafeEqual(signature, expected)) return null;

  const bytes = fromBase64Url(encoded);
  if (!bytes) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload?.orgId !== "string" || !payload.orgId) return null;
  if (!ROLES.includes(payload?.role)) return null;
  if (
    typeof payload?.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    payload.exp <= now
  )
    return null;
  if (
    typeof payload?.iat !== "number" ||
    !Number.isFinite(payload.iat) ||
    payload.iat > now + 60 ||
    payload.exp <= payload.iat
  )
    return null;

  return payload;
}
