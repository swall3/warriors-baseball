import { test } from "node:test";
import assert from "node:assert/strict";

const { GET } = await import("../src/app/api/cron/notifications/route");
const previous = process.env.CRON_SECRET;

test("cron refuses requests when no secret is configured", async () => {
  delete process.env.CRON_SECRET;
  const response = await GET(new Request("http://localhost/api/cron/notifications"));
  assert.equal(response.status, 503);
});

test("cron refuses unauthenticated requests before database access", async () => {
  process.env.CRON_SECRET = "test-cron-secret";
  try {
    const response = await GET(new Request("http://localhost/api/cron/notifications"));
    assert.equal(response.status, 401);
    const invalid = await GET(new Request("http://localhost/api/cron/notifications", {
      headers: { authorization: "Bearer wrong" },
    }));
    assert.equal(invalid.status, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
