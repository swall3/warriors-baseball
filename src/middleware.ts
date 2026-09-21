import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken } from "@/lib/coach/auth";

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
const OPEN = new Set(["/coach/login", "/api/coach/login"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (OPEN.has(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await expectedToken(); // null when APP_PASSCODE unset -> fails closed
  if (expected && cookie === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/coach/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/coach/:path*", "/api/coach/:path*"],
};
