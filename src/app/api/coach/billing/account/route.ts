import { NextResponse } from "next/server";
import { ACCOUNT_COOKIE, authClient, checked } from "@/lib/billing/server";
import { sessionFor, failure } from "@/lib/coach/live/http";
import { client, LiveError } from "@/lib/coach/live/store";
export async function POST(request: Request) {
  try {
    const session = await sessionFor(request, true);
    const body = await request.json();
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new LiveError("Enter your email address.", 400);
    const auth = authClient();
    if (body.action === "send") {
      // Only operator-provisioned accounts can receive a code. Never auto-create owners.
      const { error } = await auth.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error && error.status === 429)
        throw new LiveError(
          "Please wait before requesting another email.",
          429,
        );
      if (error && (!error.status || error.status >= 500))
        throw new LiveError("Email sign-in is temporarily unavailable.", 503);
      return NextResponse.json(
        {
          ok: true,
          message:
            "If this email has an account, a sign-in code is on its way.",
        },
        { headers: { "Cache-Control": "no-store, private" } },
      );
    }
    if (
      body.action !== "verify" ||
      typeof body.token !== "string" ||
      !/^\d{6,10}$/.test(body.token)
    )
      throw new LiveError("Enter the code from your email.", 400);
    const { data, error } = await auth.auth.verifyOtp({
      email,
      token: body.token,
      type: "email",
    });
    if (
      error ||
      !data.session ||
      !data.user?.email_confirmed_at ||
      data.user.is_anonymous
    )
      throw new LiveError(
        "The code is invalid or expired. Request another.",
        401,
      );
    const owners = await client()
      .from("org_billing")
      .select("id")
      .eq("org_id", session.orgId)
      .eq("owner_user_id", data.user.id)
      .limit(1);
    checked(owners.error);
    if (!owners.data?.length)
      throw new LiveError(
        "This account has not been assigned billing ownership for your organization.",
        403,
      );
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store, private" } },
    );
    response.cookies.set(ACCOUNT_COOKIE, data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/coach/billing",
      maxAge: Math.min(data.session.expires_in, 3600),
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    await sessionFor(request, true);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store, private" } },
    );
    response.cookies.set(ACCOUNT_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/coach/billing",
      maxAge: 0,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
