import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase not configured");
  return createClient(url, key);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerName, age, parentName, phone, email, position, experience, notes } = body;

    if (!playerName || !age || !parentName || !phone || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from("tryout_signups").insert([{
      player_name: playerName,
      age: parseInt(age),
      parent_name: parentName,
      phone,
      email,
      position: position || null,
      experience: experience || null,
      notes: notes || null,
      signed_up_at: new Date().toISOString(),
    }]);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: "Failed to save signup" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
