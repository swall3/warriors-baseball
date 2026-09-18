import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerName, age, parentName, phone, email, position, experience, notes } = body;

    if (!playerName || !age || !parentName || !phone || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabaseClient();
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
