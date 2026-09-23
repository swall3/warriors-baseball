// Run separately on the disposable PostgREST/auth proxy and access-api fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = "http://localhost:4183";
const ids = {
  owner: "bbbbbbbb-0000-4000-8000-000000000001",
  newparent: "cccccccc-0000-4000-8000-000000000002",
  newcoach: "cccccccc-0000-4000-8000-000000000001",
};
const sql = (query: string) => execFileSync("docker", ["exec", "-i", "codex-ninety-feet-db-tests",
  "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8" });
const call = (user: string, path: string, body?: unknown, org = "access-api") =>
  fetch(base + path, { method: body ? "POST" : "GET", headers: {
    cookie: `iw_account=local-access-${user}; iw_organization=${org}`,
    origin: base, "Content-Type": "application/json",
  }, body: body ? JSON.stringify(body) : undefined });
const cleanup = () => sql(`
  delete from team_billing where org_id in (select id from organizations where name='API Signup Club');
  delete from org_billing where org_id in (select id from organizations where name='API Signup Club');
  delete from teams where org_id in (select id from organizations where name='API Signup Club');
  delete from organizations where name='API Signup Club';
  delete from join_requests where org_id='access-api' and user_id in ('${ids.newparent}','${ids.newcoach}');
  delete from join_links where org_id='access-api' and created_by in ('${ids.owner}','${ids.newcoach}');
  delete from org_members where org_id='access-api' and user_id in ('${ids.newparent}','${ids.newcoach}');
`);
const checked = async (r: Response, status = 200) => {
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
};

test("shared parent and coach links require verified signup and approval", async () => {
  cleanup();
  sql(`insert into auth.users(id,email,email_confirmed_at) values
    ('${ids.newparent}','newparent@access.example.test',now()),
    ('${ids.newcoach}','newcoach@access.example.test',now()) on conflict(id) do nothing;`);
  try {
    const parentLink = await checked(await call("owner", "/api/coach/join", {
      action: "create_link", kind: "parent", teamId: "access-api-a",
    }));
    assert.match(parentLink.token, /^[A-Za-z0-9_-]{43}$/);
    const info = await checked(await call("newparent", `/api/onboarding?token=${parentLink.token}`));
    assert.equal(info.link.kind, "parent");
    assert.equal(info.link.teamName, "Team A");
    await checked(await call("newparent", "/api/account", {
      action: "send", email: "newparent@access.example.test", join: parentLink.token,
    }));
    await checked(await call("newparent", "/api/account", {
      action: "verify", email: "newparent@access.example.test", token: "000000",
    }));
    await checked(await call("newparent", "/api/onboarding", {
      action: "request", token: parentLink.token, childName: "Linked Child",
    }));
    assert.equal((await checked(await call("owner", "/api/coach/join?summary=1"))).pendingCount, 1);
    await checked(await call("newparent", "/api/coach/join?summary=1"), 401);
    const before = await checked(await call("newparent", "/api/account"));
    assert.equal(before.organizations.length, 0);
    const parentQueue = await checked(await call("owner", "/api/coach/join"));
    const parentRequest = parentQueue.requests.find((r: any) => r.kind === "parent" && r.user_id === ids.newparent);
    assert.ok(parentRequest);
    await checked(await call("newparent", "/api/coach/join", {
      action: "approve", requestId: parentRequest.id, playerId: "access-api-child",
    }), 401);
    await checked(await call("owner", "/api/coach/join", {
      action: "approve", requestId: parentRequest.id, playerId: "access-api-child",
    }));
    assert.equal((await checked(await call("owner", "/api/coach/join?summary=1"))).pendingCount, 0);
    const after = await checked(await call("newparent", "/api/account"));
    assert.equal(after.organizations[0].hasFamily, true);
    const family = await checked(await call("newparent", "/api/coach/family"));
    assert.equal(family.linkedPlayers[0].id, "access-api-child");

    const coachLink = await checked(await call("owner", "/api/coach/join", {
      action: "create_link", kind: "coach",
    }));
    await checked(await call("newcoach", "/api/account", {
      action: "send", email: "newcoach@access.example.test", join: coachLink.token,
    }));
    await checked(await call("newcoach", "/api/onboarding", {
      action: "request", token: coachLink.token, note: "I coach 10U",
    }));
    assert.equal((await checked(await call("owner", "/api/coach/join?summary=1"))).pendingCount, 1);
    const coachQueue = await checked(await call("owner", "/api/coach/join"));
    const coachRequest = coachQueue.requests.find((r: any) => r.kind === "coach" && r.user_id === ids.newcoach);
    assert.ok(coachRequest);
    await checked(await call("owner", "/api/coach/join", {
      action: "approve", requestId: coachRequest.id, teamId: "access-api-b", role: "assistant_coach",
    }));
    assert.equal((await checked(await call("newcoach", "/api/coach/join?summary=1"))).pendingCount, 0);
    const assistantQueue = await checked(await call("newcoach", "/api/coach/join"));
    assert.equal(assistantQueue.requests.length, 0);
    await checked(await call("newcoach", "/api/coach/join", {
      action: "create_link", kind: "parent", teamId: "access-api-a",
    }), 409);
    const assistantLink = await checked(await call("newcoach", "/api/coach/join", {
      action: "create_link", kind: "parent", teamId: "access-api-b",
    }));
    assert.match(assistantLink.token, /^[A-Za-z0-9_-]{43}$/);
    await checked(await call("newparent", "/api/onboarding", {
      action: "request", token: parentLink.token, childName: "Second Child",
    }));
    assert.equal((await checked(await call("owner", "/api/coach/join?summary=1"))).pendingCount, 1);
    assert.equal((await checked(await call("newcoach", "/api/coach/join?summary=1"))).pendingCount, 0);
    const catalog = await checked(await call("newcoach", "/api/coach/catalog"));
    assert.deepEqual(catalog.teams.map((t: any) => t.id), ["access-api-b"]);

    await checked(await call("owner", "/api/coach/join", { action: "revoke_link", token: parentLink.token }));
    await checked(await call("newparent", `/api/onboarding?token=${parentLink.token}`), 404);
    const created = await checked(await call("newcoach", "/api/account", {
      action: "create_org", name: "API Signup Club", teamName: "First Team",
    }));
    assert.match(created.orgId, /^org-/);
    const newOrgCatalog = await checked(await call("newcoach", "/api/coach/catalog", undefined, created.orgId));
    assert.equal(newOrgCatalog.organization.name, "API Signup Club");
    assert.equal(newOrgCatalog.teams.length, 1);
  } finally { cleanup(); }
});
