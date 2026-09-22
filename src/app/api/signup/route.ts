// POST /api/signup — the public tryout form.
//
// PUBLIC AND SINGLE-TENANT BY DECISION, not by omission (MULTI-TENANT-PLAN
// §5.1). The marketing site sells one 8U team to local parents; it is not a
// per-tenant CMS and is not becoming one. A second org gets a link to its own
// site, which is the escape hatch §5.3 recommends and the one it will actually
// want.
//
// ⚠️ THIS ROUTE IS THE ONLY PLACE IN MT-2 WHERE RLS ACTUALLY ENFORCES
// ANYTHING. Everything under /api/coach still runs on the service-role key,
// which carries BYPASSRLS and sails through migration 013's policies (T2);
// enforcement there lands in MT-3 §3.4 Stage B. This route does not need that
// key — it performs exactly one INSERT — so it runs on the anon key instead,
// where migration 013's `public_signup_insert` policy is the whole of its
// authority: INSERT on tryout_signups, where org_id = 'org-outlaws', and
// nothing else. No select, no other table.
//
// That makes this route the proof that §2.5's policy design is correct, which
// is why §5.2 pulls it forward out of MT-5. scripts/verify-mt2.mjs tests it in
// both directions — a tampered org_id must be refused by Postgres AND an
// honest one must succeed, because only the pair rules out a blanket deny.
//
// ⚠️ The proof and the protection are two different claims. See
// getPublicSupabaseClient(): until SUPABASE_ANON_KEY is set in the deployment
// environment, this route still falls back to the service-role key and the
// policy is still bypassed in production.
import { NextRequest, NextResponse } from "next/server";
import { getPublicSupabaseClient } from "@/lib/supabase";
import { OWNER_ORG_ID } from "@/lib/tenant/context";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      playerName,
      age,
      parentName,
      phone,
      email,
      position,
      experience,
      notes,
    } = body;

    const required = [playerName, parentName, phone, email];
    const parsedAge =
      typeof age === "number"
        ? age
        : typeof age === "string" && /^\d{1,2}$/.test(age)
          ? Number(age)
          : NaN;
    if (
      required.some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 200,
      ) ||
      !Number.isInteger(parsedAge) ||
      parsedAge < 4 ||
      parsedAge > 19 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      [position, experience, notes].some(
        (v) =>
          v !== undefined &&
          v !== null &&
          (typeof v !== "string" || v.length > 2000),
      )
    )
      return NextResponse.json(
        { error: "Enter valid player and parent contact details." },
        { status: 400 },
      );

    const supabase = getPublicSupabaseClient();
    const { error } = await supabase.from("tryout_signups").insert([
      {
        player_name: playerName,
        age: parsedAge,
        parent_name: parentName,
        phone,
        email,
        position: position || null,
        experience: experience || null,
        notes: notes || null,
        signed_up_at: new Date().toISOString(),
        // Stamped explicitly, never left to the column default migration 008
        // added. That default exists as a floor under older deployed code (see
        // 008's header) and is scheduled for removal in MT-3; a write that
        // depends on it would start failing then, silently and in the one place
        // where the failure costs a family's tryout registration.
        //
        // It must also equal the literal in 013's public_signup_insert policy,
        // or every submission is refused. That coupling is documented at both
        // ends — see OWNER_ORG_ID in src/lib/tenant/context.ts.
        org_id: OWNER_ORG_ID,
      },
    ]);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to save signup" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof SyntaxError || err instanceof TypeError)
      return NextResponse.json(
        { error: "Invalid signup payload" },
        { status: 400 },
      );
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
