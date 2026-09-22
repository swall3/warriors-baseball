import { test } from "node:test";
import assert from "node:assert/strict";
import { message, sendEmail } from "../src/lib/notifications/message";
test("templates escape untrusted names, preserve app paths, and exclude private notes", () => {
  const m = message(
    {
      kind: "game_prepared",
      team_id: "team/test",
      details: {
        teamName: "<img onerror=alert(1)>",
        opponent: "A & B",
        date: "2026-09-23",
        gameId: "id/x",
        note: "PRIVATE",
      },
    },
    "https://inningwise.com",
  );
  assert.ok(!m.html.includes("<img"));
  assert.ok(m.html.includes("&lt;img"));
  assert.ok(m.text.includes("/coach/live/id%2Fx"));
  assert.ok(m.html.includes("team%2Ftest"));
  assert.ok(!m.text.includes("PRIVATE"));
  assert.ok(
    message(
      { kind: "game_final", team_id: "t", details: { gameId: "g" } },
      "https://inningwise.com",
    ).html.includes("/g/insights"),
  );
  assert.throws(() =>
    message({ kind: "test", team_id: "t", details: {} }, "javascript:alert(1)"),
  );
});
test("sender uses stable idempotency, fixed provider and never reports provider errors as accepted", async () => {
  const payload = {
    from: "InningWise <notifications@mail.inningwise.com>",
    to: ["owner@example.test"],
    ...message(
      { kind: "test", team_id: "t", details: {} },
      "https://inningwise.com",
    ),
  };
  const calls: any[] = [];
  const transport = async (url: any, options: any) => {
    calls.push({ url, ...options });
    return Response.json({ id: "provider-id" });
  };
  assert.equal(
    await sendEmail(payload, "event-id", "test-key", transport as typeof fetch),
    "provider-id",
  );
  await sendEmail(payload, "event-id", "test-key", transport as typeof fetch);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(
    calls[0].headers["Idempotency-Key"],
    calls[1].headers["Idempotency-Key"],
  );
  assert.equal(calls[0].body, calls[1].body);
  await assert.rejects(
    sendEmail(payload, "event-id", "test-key", (async () =>
      Response.json(
        { error: "secret provider detail" },
        { status: 429 },
      )) as typeof fetch),
    /429/,
  );
});
