// Run separately from access-api.test.mts against its disposable fixture.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = "http://localhost:4183";
const parent = "bbbbbbbb-0000-4000-8000-000000000003";
const sql = (query: string) =>
  execFileSync("docker", ["exec", "-i", "codex-ninety-feet-db-tests", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], {
    input: query,
    encoding: "utf8",
  });
const call = (user: "owner" | "parent", path: string, body?: unknown) =>
  fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: `iw_account=local-access-${user}; iw_organization=access-api`,
      origin: base,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const manage = async (action: string, extra: Record<string, string>) => {
  const response = await call("owner", "/api/coach/access", {
    action,
    teamId: "access-api-a",
    userId: parent,
    ...extra,
  });
  assert.equal(response.status, 200, await response.clone().text());
};
const familyVisible = async () => {
  const account = await (await call("parent", "/api/account")).json();
  assert.equal(account.organizations[0].hasFamily, true);
  const catalog = await (await call("parent", "/api/coach/catalog")).json();
  assert.equal(catalog.familyAccess, true);
  const response = await call("parent", "/api/coach/family");
  assert.equal(response.status, 200, await response.clone().text());
  const family = await response.json();
  assert.equal(family.linkedPlayers[0].id, "access-api-child");
};

test("coach promotion and team handoff retain family access", async () => {
  // A previous aborted run cannot leave the disposable fixture in a different state.
  sql(`
    delete from team_members where org_id='access-api' and team_id='access-api-a' and user_id='${parent}';
    insert into team_members(org_id,team_id,user_id,role)
      values('access-api','access-api-a','bbbbbbbb-0000-4000-8000-000000000002','head_coach')
      on conflict(org_id,team_id,user_id) do update set role='head_coach';
    insert into team_members(org_id,team_id,user_id,role)
      values('access-api','access-api-a','${parent}','parent')
      on conflict(org_id,team_id,user_id) do update set role='parent';
    insert into parent_players(org_id,team_id,user_id,player_id)
      values('access-api','access-api-a','${parent}','access-api-child') on conflict do nothing;
  `);
  try {
    await familyVisible();
    await manage("set_role", { role: "assistant_coach" });
    await familyVisible();
    await manage("transfer_team", {});
    await familyVisible();
    await manage("remove_member", {});
    const account = await (await call("parent", "/api/account")).json();
    assert.equal(account.organizations[0].hasFamily, false);
  } finally {
    sql(`
      delete from team_members where org_id='access-api' and team_id='access-api-a' and user_id='${parent}';
      insert into team_members(org_id,team_id,user_id,role)
        values('access-api','access-api-a','bbbbbbbb-0000-4000-8000-000000000002','head_coach')
        on conflict(org_id,team_id,user_id) do update set role='head_coach';
      insert into team_members(org_id,team_id,user_id,role)
        values('access-api','access-api-a','${parent}','parent')
        on conflict(org_id,team_id,user_id) do update set role='parent';
      insert into parent_players(org_id,team_id,user_id,player_id)
        values('access-api','access-api-a','${parent}','access-api-child') on conflict do nothing;
    `);
  }
});
