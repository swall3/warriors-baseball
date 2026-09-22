export type Notice = {
  kind: string;
  team_id: string;
  details: Record<string, unknown>;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const clean = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\r\n]/g, " ").slice(0, 150) : "";
export function message(notice: Notice, origin: string) {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    throw new Error("Invalid email origin");
  const team = clean(notice.details.teamName) || "Your team";
  let subject = "Email delivery test",
    text = "Your InningWise notification email connection is working.",
    path = "/coach/billing";
  if (notice.kind === "game_prepared" || notice.kind === "game_changed") {
    subject =
      notice.kind === "game_prepared"
        ? "Your game is prepared"
        : "Your game details changed";
    text = `${team} vs ${clean(notice.details.opponent)} — ${clean(notice.details.date)}. Open InningWise for the latest game details.`;
    path = "/coach/live/" + encodeURIComponent(clean(notice.details.gameId));
  } else if (notice.kind === "game_final") {
    subject = "Your final game report is ready";
    text = `${team}'s game is final. Review the score, pitch counts and team insights in InningWise.`;
    path =
      "/coach/live/" +
      encodeURIComponent(clean(notice.details.gameId)) +
      "/insights";
  } else if (notice.kind === "training_assigned") {
    subject = "New team practice assigned";
    text =
      "A coach assigned a new practice activity. Open InningWise to see who it is for and get started.";
    path = "/coach/training";
  } else if (notice.kind === "billing_changed") {
    subject = "Your team subscription changed";
    text = `Subscription status: ${clean(notice.details.status).replaceAll("_", " ")}.${notice.details.cancelAtPeriodEnd ? " Cancellation is scheduled for the end of the billing period." : ""} Open billing for the latest details. Payment testing is currently in test mode; no real charge is implied.`;
  }
  const url = base.origin + path,
    preferences =
      base.origin +
      "/coach/billing?team=" +
      encodeURIComponent(notice.team_id) +
      "#notifications";
  return {
    subject: `InningWise · ${subject}`,
    text: `${text}\n\nOpen InningWise: ${url}\n\nManage email preferences: ${preferences}`,
    html: `<!doctype html><html><body style="margin:0;background:#f5f6f3;color:#183b32;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:white;border-radius:16px"><p style="font-weight:bold;letter-spacing:1px">INNINGWISE</p><h1 style="font-size:26px">${escape(subject)}</h1><p style="line-height:1.6">${escape(text)}</p><p style="margin:28px 0"><a href="${escape(url)}" style="background:#1b4d3e;color:white;padding:14px 20px;border-radius:8px;text-decoration:none">Open InningWise</a></p><p style="font-size:13px;color:#52645d">You receive this as your team’s verified owner. <a href="${escape(preferences)}">Manage email preferences</a>.</p></main></body></html>`,
  };
}
export type EmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
};
export async function sendEmail(
  payload: EmailPayload,
  id: string,
  key: string,
  transport: typeof fetch = fetch,
) {
  const response = await transport("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `inningwise-${id}`,
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== "string")
    throw new Error(`Email provider error (${response.status})`);
  return result.id as string;
}
