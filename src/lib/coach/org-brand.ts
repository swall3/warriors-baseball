import { cache } from "react";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";

// Request-local lookup; identity comes only from the verified server session.
export const getCoachBrand = cache(async (orgId: string | null) => {
  const fallback = { name: "Your team", fullName: "Team workspace", slug: "team" };
  if (!orgId || !isSupabaseEnabled()) return fallback;
  const { data, error } = await getSupabaseClient().from("organizations")
    .select("name,short_name").eq("id", orgId).eq("active", true).maybeSingle();
  if (error || !data) return fallback;
  const name = data.short_name?.trim() || data.name;
  return { name, fullName: data.name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team" };
});
