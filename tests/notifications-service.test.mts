import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim()];
    }),
);
assert.equal(env.SUPABASE_URL, "http://127.0.0.1:54390");
Object.assign(process.env, env, {
  RESEND_API_KEY: "test-local-only",
  EMAIL_FROM: "InningWise <notifications@mail.inningwise.com>",
  BILLING_APP_URL: "https://inningwise.com",
});
const sql = (q: string) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "codex-ninety-feet-db-tests",
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: q, encoding: "utf8" },
  ).trim();
const { client } = await import("../src/lib/coach/live/store");
const { deliverPending, deliverDueNotifications, savePreferences } = await import(
  "../src/lib/notifications/server"
);
const org = "org-outlaws",
  team = "team-review-warriors",
  user = "11111111-1111-4111-8111-111111111111";
const db = client();
db.auth.admin.getUserById = async () =>
  ({
    data: {
      user: {
        id: user,
        email: "owner@example.test",
        email_confirmed_at: new Date().toISOString(),
      },
    },
    error: null,
  }) as any;
const original = globalThis.fetch;
const row = () =>
  JSON.parse(
    sql(
      `select row_to_json(n) from notification_outbox n where event_key='service-email-test'`,
    ),
  );
function reset() {
  sql(
    `delete from notification_outbox where event_key='service-email-test';insert into org_members(org_id,user_id,role) values('${org}','${user}','owner') on conflict(org_id,user_id) do update set role='owner';insert into org_billing(org_id,owner_user_id) values('${org}','${user}') on conflict(org_id) do update set owner_user_id=excluded.owner_user_id;insert into notification_preferences(org_id,team_id,user_id,games) values('${org}','${team}','${user}',true) on conflict(org_id,team_id,user_id) do update set games=true;select queue_team_notification('${org}','${team}','service-email-test','games','game_prepared','{"gameId":"test","teamName":"Test"}');`,
  );
}
function provider(status = 200) {
  const calls: any[] = [];
  globalThis.fetch = (async (url: any, options: any) => {
    if (url === "https://api.resend.com/emails") {
      calls.push(options);
      return Response.json(
        status === 200 ? { id: "accepted-test" } : { error: "unavailable" },
        { status },
      );
    }
    return original(url, options);
  }) as typeof fetch;
  return calls;
}
test("worker accepts once and concurrent drains share a lease", async () => {
  reset();
  const calls = provider();
  try {
    await Promise.all([deliverPending(org, team), deliverPending(org, team)]);
    assert.equal(row().status, "accepted");
    assert.equal(calls.length, 1);
    await deliverPending(org, team);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("provider failure retains identical payload for retry", async () => {
  reset();
  let calls = provider(503);
  try {
    await deliverPending(org, team);
    assert.equal(row().status, "pending");
    const before = calls[0];
    sql(
      `update notification_outbox set next_attempt_at=now() where event_key='service-email-test'`,
    );
    calls = provider();
    await deliverPending(org, team);
    assert.equal(row().status, "accepted");
    assert.equal(calls[0].body, before.body);
    assert.equal(
      calls[0].headers["Idempotency-Key"],
      before.headers["Idempotency-Key"],
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("opt-out cancels queued events without sending", async () => {
  reset();
  const calls = provider();
  try {
    await savePreferences(org, team, user, {
      games: false,
      training: false,
      billing: false,
    });
    await deliverPending(org, team);
    assert.equal(row().status, "skipped");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = original;
  }
});
test("scheduled delivery ignores held mail and sends a new due notice", async () => {
  reset();
  sql(`update notification_outbox set status='review' where event_key='service-email-test';select queue_team_notification('${org}','${team}','service-email-new','games','game_prepared','{"gameId":"new"}');`);
  const calls = provider();
  try {
    const result = await deliverDueNotifications();
    assert.equal(result.configured, true);
    assert.equal(row().status, "review");
    assert.equal(sql("select status from notification_outbox where event_key='service-email-new'"), "accepted");
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
    sql("delete from notification_outbox where event_key in ('service-email-test','service-email-new')");
  }
});
test("ownership change prevents delivery to former owner", async () => {
  reset();
  // Organization ownership moves to another account: the queued event must not be sent.
  sql(
    `update org_members set role='member' where org_id='${org}' and user_id='${user}';insert into org_members(org_id,user_id,role) values('${org}','22222222-2222-4222-8222-222222222222','owner') on conflict(org_id,user_id) do update set role='owner';update org_billing set owner_user_id='22222222-2222-4222-8222-222222222222' where org_id='${org}'`,
  );
  const calls = provider();
  try {
    await deliverPending(org, team);
    assert.equal(row().status, "skipped");
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = original;
    sql(
      `delete from notification_outbox where event_key='service-email-test';delete from org_members where org_id='${org}' and user_id='22222222-2222-4222-8222-222222222222';update org_members set role='owner' where org_id='${org}' and user_id='${user}';update org_billing set owner_user_id='${user}' where org_id='${org}';update notification_preferences set games=false,training=false,billing=false where org_id='${org}' and team_id='${team}' and user_id='${user}'`,
    );
  }
});
