import { NextRequest, NextResponse } from "next/server";
import { resolveCoachSession } from "@/lib/coach/auth";

// Gate for the ported Outlaws coach tool. Allow-by-default: the matcher
// below is the entire allowlist. Anything not matched (Warriors' public
// site, /games, /api/signup, and every root-level asset)
// never enters this function at all — it cannot be accidentally gated by a
// change in here.
//
// Inside the matcher, only /coach/login (the page) and /api/coach/login
// (the POST it submits to, which is how the cookie gets minted in the
// first place) are reachable without a valid session cookie. Everything
// else — every other /coach/* page and every other /api/coach/* route —
// requires it.
//
// PWA install assets are open too, and they have to be. `/coach/:path*`
// matches static files under public/coach/ as well as pages, so a gated
// manifest answers the browser's install request with a 307 to /coach/login.
// A redirect is not JSON, the manifest fails to parse, and the install fails
// *silently* — no console error on most browsers. Icons are worse: the OS
// installer fetches them outside the page's credential context, so the cookie
// is not guaranteed to be present even for a logged-in coach.
//
// Nothing here is secret — they are a name, a theme colour and four PNGs.
// (MULTI-TENANT-PLAN §0.1 finding 3 / MT-1 step 5; MERGE-PLAN §4 warned about
// exactly this trap.)
//
// /coach/images/* is deliberately NOT opened: it is page content (the
// spray-chart field background), loaded by an <img> from an already
// authenticated page, so it carries the cookie and does not need the hole.
const OPEN = new Set([
  "/coach/login",
  "/api/coach/login",
  "/coach/manifest.webmanifest",
  "/coach/apple-touch-icon.png",
]);

const OPEN_PREFIXES = ["/coach/icons/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (OPEN.has(pathname) || OPEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // MT-3: the same resolver the route handlers use (auth.ts), given this
  // request's cookie jar instead of next/headers. It verifies the signed
  // ec_coach_session HMAC and falls back to the MT-2 ec_coach_auth hash for
  // browsers that logged in before this deploy — see auth.ts's header for why
  // that bridge exists and why it is not a weakening.
  //
  // Sharing the resolver is the point: an edge gate and a handler gate that
  // each reimplement "is this session valid" is how one of them ends up
  // accepting something the other rejects.
  //
  // Still fails closed — resolveCoachSession() returns null when neither
  // SESSION_SECRET nor APP_PASSCODE is configured.
  //
  // The middleware only asks WHETHER, not WHO. Trusting an org id decided here
  // and passed downstream in a header would make the gate the authority on
  // tenancy; instead each handler re-resolves the session itself
  // (requireCoach() -> getOrgContext()), so the org a query is scoped to comes
  // from the cookie that request actually carried.
  const session = await resolveCoachSession((name) => req.cookies.get(name)?.value);
  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/coach/login";
  url.search = "";
  url.searchParams.set("from", pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/coach/:path*", "/api/coach/:path*"],
};
