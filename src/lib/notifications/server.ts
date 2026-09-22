import { randomUUID } from "node:crypto";
import { client, LiveError } from "@/lib/coach/live/store";
import { message, sendEmail, type EmailPayload } from "./message";
export const categories = ["games", "training", "billing"] as const;
export type Preferences = Record<(typeof categories)[number], boolean>;
export const defaults: Preferences = {
  games: false,
  training: false,
  billing: false,
};
export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}
function checked(error: { message: string } | null) {
  if (error)
    throw new LiveError("Email settings are unavailable. Please retry.", 503);
}
export async function preferences(org: string, team: string, user: string) {
  const r = await client()
    .from("notification_preferences")
    .select("games,training,billing")
    .eq("org_id", org)
    .eq("team_id", team)
    .eq("user_id", user)
    .maybeSingle();
  checked(r.error);
  return (r.data ?? defaults) as Preferences;
}
export async function savePreferences(
  org: string,
  team: string,
  user: string,
  body: unknown,
) {
  if (
    !body ||
    typeof body !== "object" ||
    categories.some((k) => typeof (body as Preferences)[k] !== "boolean")
  )
    throw new LiveError("Choose your email preferences.", 400);
  const prefs = Object.fromEntries(
    categories.map((k) => [k, (body as Preferences)[k]]),
  );
  const r = await client()
    .from("notification_preferences")
    .upsert({
      org_id: org,
      team_id: team,
      user_id: user,
      ...prefs,
      updated_at: new Date().toISOString(),
    });
  checked(r.error);
  // Cancel queued mail immediately when opting out. In-flight mail may already be accepted.
  const disabled = categories.filter((k) => !prefs[k]);
  if (disabled.length) {
    const canceled = await client()
      .from("notification_outbox")
      .update({ status: "skipped", last_error: "Preference disabled" })
      .eq("org_id", org)
      .eq("team_id", team)
      .eq("user_id", user)
      .eq("status", "pending")
      .in("category", disabled);
    checked(canceled.error);
  }
  return prefs;
}
export async function recentNotifications(
  org: string,
  team: string,
  user: string,
) {
  const r = await client()
    .from("notification_outbox")
    .select("id,kind,status,created_at,provider_id,last_error")
    .eq("org_id", org)
    .eq("team_id", team)
    .eq("user_id", user)
    .order("created_at", { ascending: false })
    .limit(12);
  checked(r.error);
  return r.data ?? [];
}
export async function queueTest(org: string, team: string, user: string) {
  if (!emailConfigured())
    throw new LiveError("Notification email is not configured.", 503);
  // At most one test every ten minutes, including retries from multiple tabs.
  const event = `test:${Math.floor(Date.now() / 600000)}`;
  const r = await client()
    .from("notification_outbox")
    .upsert(
      {
        org_id: org,
        team_id: team,
        user_id: user,
        event_key: event,
        category: "test",
        kind: "test",
        details: {},
      },
      {
        onConflict: "org_id,team_id,user_id,event_key",
        ignoreDuplicates: true,
      },
    );
  checked(r.error);
}
export async function deliverPending(org: string, team: string | null = null) {
  if (!emailConfigured()) return;
  const db = client();
  for (let i = 0; i < 3; i++) {
    const token = randomUUID();
    const claimed = await db.rpc("claim_notification", {
      p_org: org,
      p_team: team,
      p_token: token,
    });
    checked(claimed.error);
    const row = claimed.data?.[0];
    if (!row) return;
    const finish = async (patch: Record<string, unknown>) => {
      const r = await db
        .from("notification_outbox")
        .update({ ...patch, lock_token: null, lock_until: null })
        .eq("org_id", org)
        .eq("id", row.id)
        .eq("lock_token", token);
      checked(r.error);
    };
    try {
      const owner = await db
        .from("team_billing")
        .select("owner_user_id")
        .eq("org_id", org)
        .eq("team_id", row.team_id)
        .maybeSingle();
      checked(owner.error);
      const organization = await db
        .from("organizations")
        .select("active")
        .eq("id", org)
        .maybeSingle();
      checked(organization.error);
      const prefs = await preferences(org, row.team_id, row.user_id);
      if (
        !organization.data?.active ||
        owner.data?.owner_user_id !== row.user_id ||
        (row.category !== "test" && !prefs[row.category as keyof Preferences])
      ) {
        await finish({
          status: "skipped",
          last_error: "Recipient or preference changed",
        });
        continue;
      }
      const account = await db.auth.admin.getUserById(row.user_id);
      if (account.error) throw new Error("Recipient lookup unavailable");
      const user = account.data.user;
      if (!user?.email || !user.email_confirmed_at || user.is_anonymous) {
        await finish({
          status: "skipped",
          last_error: "Verified recipient unavailable",
        });
        continue;
      }
      let payload = row.payload as EmailPayload | null;
      // Freeze the complete request before sending: retries must have identical bytes.
      if (payload && payload.to[0] !== user.email) {
        await finish({
          status: "skipped",
          last_error: "Recipient email changed",
        });
        continue;
      }
      if (!payload) {
        payload = {
          from: process.env.EMAIL_FROM!,
          to: [user.email],
          ...message(
            row,
            process.env.BILLING_APP_URL || "https://inningwise.com",
          ),
        };
        const saved = await db
          .from("notification_outbox")
          .update({ payload })
          .eq("id", row.id)
          .eq("org_id", org)
          .eq("lock_token", token)
          .select("id");
        checked(saved.error);
        if (saved.data?.length !== 1) throw new Error("Email lease expired");
      }
      const providerId = await sendEmail(
        payload,
        row.id,
        process.env.RESEND_API_KEY!,
      );
      await finish({
        status: "accepted",
        provider_id: providerId,
        last_error: null,
      });
    } catch {
      await finish({
        status: "pending",
        next_attempt_at: new Date(
          Date.now() + Math.min(60 * 2 ** row.attempts, 3600) * 1000,
        ).toISOString(),
        last_error: "Delivery could not be confirmed. It is queued for retry.",
      });
    }
  }
}
// Failures sending mail must never turn a saved game action into an apparent failure.
export async function safelyDeliver(org: string, team: string | null = null) {
  try {
    await deliverPending(org, team);
  } catch {
    console.error("[notifications] pending email processing unavailable");
  }
}
