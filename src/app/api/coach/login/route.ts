// POST /api/coach/login — MULTI-TENANT-PLAN.md §3.2, phase MT-3.
//
// This route changed from a COMPARE into a LOOKUP. It used to ask "does the
// submitted passcode equal APP_PASSCODE?"; it now asks "which org does this
// passcode belong to?", hashes the submission, and finds the org_passcodes row
// (migration 015). The answer is minted into a signed session cookie carrying
// that org id, which is what every downstream query is then scoped by.
//
// FAIL-CLOSED, in all three of its senses (MERGE-PLAN B7, §3.1):
//   * No matching active passcode row -> 401. Never a default org, never a
//     guess. Resolving an unknown passcode to SOME org is the one failure mode
//     that hands a stranger a real tenant's data.
//   * APP_PASSCODE unset -> the legacy path below cannot match either, because
//     getPasscode() returns null and null is not a string a caller can submit.
//   * SESSION_SECRET unset -> no signed cookie can be minted at all; see the
//     narrow, owner-only fallback below.
import { legacyAllowed } from "@/lib/access/identity";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  COOKIE_MAX_AGE,
  getPasscode,
  hashPasscode,
} from "@/lib/coach/auth";
import {
  SESSION_COOKIE,
  getSessionSecret,
  signSession,
  type OrgRole,
} from "@/lib/coach/session";
import { OWNER_ORG_ID } from "@/lib/tenant/context";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

export const runtime = "nodejs";

type PasscodeRow = { org_id: string; role: OrgRole };

// Looks a passcode hash up in org_passcodes.
//
// ⚠️ Uses getSupabaseClient() DIRECTLY rather than sbSelectAll(). That looks
// like exactly the unscoped access the MT-2 chokepoint exists to prevent, so
// the reason is worth stating: the four scoped shims require an OrgScope in
// argument position 1, and this query's entire job is to DISCOVER the org. There
// is no scope to pass yet — passing one would mean already knowing the answer.
// This is the same carve-out src/lib/supabase.ts's "SCOPE" note makes for
// `organizations` and `org_members`: tables that identify tenants cannot
// themselves be tenant-scoped. The compiler cannot catch a wrong scope here,
// only a reviewer can, which is why it is one query in one file.
//
// org_passcodes has RLS on with zero policies (015 §3), so this service-role
// path is the only way to read it at all — anon cannot, by construction.
//
// Returns null on ANY database problem, so the caller can fall through to the
// APP_PASSCODE path rather than 500. A login failing because Supabase is
// unreachable is exactly the regression MT-3's gate forbids, and it would
// arrive during a game.
async function lookupPasscode(
  passcodeSha: string,
): Promise<PasscodeRow | null> {
  if (!isSupabaseEnabled()) return null;
  try {
    const { data, error } = await getSupabaseClient()
      .from("org_passcodes")
      .select("org_id,role")
      .eq("passcode_sha", passcodeSha)
      .eq("active", true)
      .abortSignal(AbortSignal.timeout(5_000));
    if (error) {
      console.error(
        "[coach/login] org_passcodes lookup failed:",
        error.message,
      );
      return null;
    }
    // The partial unique index idx_org_passcodes_sha makes >1 row impossible
    // for an active hash; Postgres refuses the second insert at provisioning
    // time. If one ever appears anyway, refuse rather than pick — an ambiguous
    // tenancy answer must never be resolved by row order.
    if (!data || data.length !== 1) {
      if (data && data.length > 1) {
        console.error(
          "[coach/login] passcode resolves to multiple orgs — refusing",
        );
      }
      return null;
    }
    return data[0] as PasscodeRow;
  } catch (e) {
    console.error(
      "[coach/login] org_passcodes lookup threw:",
      (e as Error).message,
    );
    return null;
  }
}

export async function POST(req: NextRequest) {
  let passcode = "";
  try {
    const body = await req.json();
    passcode = typeof body?.passcode === "string" ? body.passcode : "";
  } catch {
    return NextResponse.json(
      { ok: false, error: "Bad request" },
      { status: 400 },
    );
  }

  const submitted = passcode.trim();
  if (!submitted || submitted.length > 256) {
    return NextResponse.json(
      { ok: false, error: "Wrong passcode" },
      { status: 401 },
    );
  }

  const passcodeSha = await hashPasscode(submitted);

  // 1. The real path: which org owns this passcode?
  let resolved: PasscodeRow | null = await lookupPasscode(passcodeSha);

  // 2. The owner's APP_PASSCODE, which is still how Stuart logs in.
  //
  // §7 MT-3 step 1 says to seed his current APP_PASSCODE into org_passcodes.
  // That seeding cannot happen in this branch: the live value is in Vercel, not
  // in the repo, and guessing it is out of the question (MERGE-PLAN.md:471
  // shows the OLD published default). scripts/seed-owner-passcode.mjs does it,
  // reading the env var and never printing it.
  //
  // Until that script runs — and afterwards, harmlessly, since (1) then matches
  // first — this keeps org-outlaws' login byte-identical to MT-2's. It is a
  // COMPARE against the same env var against which the old code compared, so
  // it grants exactly what it granted yesterday: the owner org, to whoever
  // already had the owner org.
  //
  // Delete it once the seed row exists and Stuart has confirmed a login.
  if (!resolved) {
    const configured = getPasscode(); // null when APP_PASSCODE unset -> fails closed
    if (configured && submitted === configured) {
      resolved = { org_id: OWNER_ORG_ID, role: "owner" };
    }
  }

  if (!resolved) {
    return NextResponse.json(
      { ok: false, error: "Wrong passcode" },
      { status: 401 },
    );
  }

  if (!(await legacyAllowed(resolved.org_id)))
    return NextResponse.json(
      {
        ok: false,
        error:
          "This organization uses individual accounts. Choose Sign in with email.",
      },
      { status: 403 },
    );
  const secret = getSessionSecret();

  // SESSION_SECRET is a new env var as of this commit and is NOT yet set in
  // Vercel — setting it is Stuart's action, not this branch's. The same
  // situation, and the same treatment, as SUPABASE_ANON_KEY in MT-2
  // (src/lib/supabase.ts's getPublicSupabaseClient): a deploy that arrives
  // before the env var must not break the thing that already worked.
  //
  // So when the secret is missing, this mints the MT-2 cookie exactly as the
  // old code did — but ONLY for the owner org. Any other tenant is refused
  // outright, because ec_coach_auth has no field to carry an org in; issuing it
  // to a second tenant would silently drop them into org-outlaws' data. Serving
  // the wrong tenant is worse than serving an error.
  //
  // REMOVE THIS FALLBACK once SESSION_SECRET is set in Vercel, at which point a
  // missing secret should be a hard failure.
  if (!secret) {
    if (resolved.org_id !== OWNER_ORG_ID) {
      console.error(
        "[coach/login] SESSION_SECRET unset — refusing a non-owner org login",
      );
      return NextResponse.json(
        { ok: false, error: "Sessions are not configured on this server" },
        { status: 503 },
      );
    }
    console.warn(
      "[coach/login] SESSION_SECRET is not set — falling back to the MT-2 " +
        "unsigned cookie for the owner org. Multi-tenant login is disabled " +
        "until it is set.",
    );
    const res = NextResponse.json({ ok: true });
    res.cookies.set(AUTH_COOKIE, passcodeSha, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  }

  // COOKIE_MAX_AGE for both the cookie and the payload's `exp`, so the two
  // expire together. 30 days, unchanged since MT-2 — a shorter session would
  // log Stuart out sooner than today, which is an observable change and fails
  // MT-3's gate on its own.
  const token = await signSession(
    { orgId: resolved.org_id, role: resolved.role },
    secret,
    COOKIE_MAX_AGE,
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  // Clear any MT-2 cookie this browser still holds. Not housekeeping: that
  // cookie resolves to org-outlaws unconditionally (auth.ts's bridge), so a
  // coach from another tenant logging in on a browser that once held it would
  // otherwise keep a second, contradictory identity in the jar.
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

// Logout: clear both cookies. Clearing only one would leave a browser logged
// in through the other.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
