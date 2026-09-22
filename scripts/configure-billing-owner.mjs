// Operator-only bootstrap. Never exposed through the shared passcode UI.
// Loads environment from the invoking shell; use Node --env-file explicitly.
import { createClient } from "@supabase/supabase-js";
const [orgId, teamId, emailArg, ...options] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
if (!orgId || !teamId || !email || !email.includes("@"))
  throw new Error(
    "Usage: node --env-file=.env.local scripts/configure-billing-owner.mjs ORG_ID TEAM_ID EMAIL [--complimentary]",
  );
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Server database configuration required");
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const team = await db
  .from("teams")
  .select("id,name")
  .eq("org_id", orgId)
  .eq("id", teamId)
  .eq("kind", "own")
  .single();
if (team.error) throw team.error;
let user;
for (let page = 1; ; page++) {
  const result = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (result.error) throw result.error;
  user = result.data.users.find((u) => u.email?.toLowerCase() === email);
  if (user || result.data.users.length < 1000) break;
}
if (!user) {
  // Creating the account does not confirm the email or send any message.
  const created = await db.auth.admin.createUser({
    email,
    email_confirm: false,
  });
  if (created.error) throw created.error;
  user = created.data.user;
}
const existing = await db
  .from("team_billing")
  .select("id,owner_user_id")
  .eq("org_id", orgId)
  .eq("team_id", teamId)
  .maybeSingle();
if (existing.error) throw existing.error;
if (existing.data?.owner_user_id && existing.data.owner_user_id !== user.id)
  throw new Error(
    "An owner is already assigned. Ownership transfer requires a separate reviewed operation.",
  );
const row = {
  org_id: orgId,
  team_id: teamId,
  owner_user_id: user.id,
  ...(options.includes("--complimentary") ? { complimentary: true } : {}),
};
const saved = existing.data
  ? await db.from("team_billing").update(row).eq("id", existing.data.id)
  : await db.from("team_billing").insert(row);
if (saved.error) throw saved.error;
console.log(
  `Billing owner assigned for ${team.data.name}. Email verification is still required before managing payments.`,
);
