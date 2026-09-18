// Shared-passcode gate helpers for the /coach section. Runs in both edge
// (middleware) and node (route) runtimes. The cookie never stores the plain
// passcode — it stores a SHA-256 hash, so a leaked cookie doesn't reveal the
// PIN. This is a lightweight gate for a single-team tool, not a full auth
// system.
//
// Ported from outlaws-field-app/src/lib/auth.ts during the /coach merge, with
// one deliberate security fix: this version fails CLOSED. The original
// defaulted an unset APP_PASSCODE to the literal string "outlaws" — a real
// hole (anyone could log in with the well-known default). Here, an unset
// APP_PASSCODE means nobody can pass the gate until it's configured.

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
