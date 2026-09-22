import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { signSession } from "../src/lib/coach/session";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const base = "http://localhost:4183";
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
const call = (
  user: string,
  path: string,
  body?: unknown,
  org = "access-api",
  origin = base,
) =>
  fetch(base + path, {
    method: body ? "POST" : "GET",
    redirect: "manual",
    headers: {
      cookie: `iw_account=local-access-${user}; iw_organization=${org}`,
      origin,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test("invitation API binds the email, accepts once, and honors revocation", async () => {
  const invite = async () => {
    const response = await call("owner", "/api/coach/access", {
      action: "invite",
      teamId: "access-api-a",
      email: "other@access.example.test",
      role: "assistant_coach",
    });
    assert.equal(response.status, 200, await response.clone().text());
    const data = await response.json();
    return {
      ...data,
      token: new URLSearchParams(new URL(data.inviteLink).hash.slice(1)).get(
        "invite",
      ),
    };
  };
  const i = await invite();
  assert.equal(
    (
      await call("parent", "/api/account", {
        action: "accept",
        invite: i.token,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call("other", "/api/account", { action: "accept", invite: i.token }))
      .status,
    200,
  );
  assert.equal(
    (await call("other", "/api/account", { action: "accept", invite: i.token }))
      .status,
    409,
  );
  const c = await (await call("other", "/api/coach/catalog")).json();
  assert.deepEqual(
    c.teams.map((t: any) => t.id),
    ["access-api-a"],
  );
  assert.equal(
    (
      await call("owner", "/api/coach/access", {
        action: "remove_member",
        userId: "bbbbbbbb-0000-4000-8000-000000000004",
      })
    ).status,
    200,
  );
  assert.equal((await call("other", "/api/coach/catalog")).status, 401);
  const pending = await invite();
  assert.equal(
    (
      await call("owner", "/api/coach/access", {
        action: "revoke_invite",
        invitationId: pending.invitationId,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("other", "/api/account", {
        action: "accept",
        invite: pending.token,
      })
    ).status,
    409,
  );
});
test("catalog and roster isolate assigned teams, not just organizations", async () => {
  const r = await call("coach", "/api/coach/catalog");
  assert.equal(r.status, 200);
  const c = await r.json();
  assert.deepEqual(
    c.teams.map((t: any) => t.id),
    ["access-api-a"],
  );
  assert.deepEqual(
    c.players.map((p: any) => p.id),
    ["access-api-child"],
  );
  assert.equal(
    (await call("coach", "/api/coach/roster?teamId=access-api-b")).status,
    403,
  );
  assert.equal(
    (
      await call("coach", "/api/coach/roster", {
        teamId: "access-api-b",
        kind: "player",
        name: "Forbidden",
      })
    ).status,
    403,
  );
  assert.equal((await call("other", "/api/coach/catalog")).status, 401);
});
test("parents get only their linked player, never coaching APIs", async () => {
  const r = await call("parent", "/api/coach/family");
  assert.equal(r.status, 200);
  assert.deepEqual(
    (await r.json()).players.map((p: any) => p.id),
    ["access-api-child"],
  );
  for (const p of [
    "/api/coach/roster?teamId=access-api-a",
    "/api/coach/live",
    "/api/coach/access",
    "/api/coach/training",
  ])
    assert.equal((await call("parent", p)).status, 403, p);
  assert.equal(
    new URL(
      (await call("parent", "/coach/today")).headers.get("location")!,
      base,
    ).pathname,
    "/coach/family",
  );
});
test("legacy passcodes cannot bypass enabled individual accounts", async () => {
  const token = await signSession(
    { orgId: "access-api", role: "owner" },
    env.SESSION_SECRET,
    3600,
  );
  const r = await fetch(base + "/api/coach/catalog", {
    headers: { cookie: `ec_coach_session=${token}` },
  });
  assert.equal(r.status, 401);
});
test("permission management needs verified membership, appropriate role and same origin", async () => {
  assert.equal(
    (
      await call("coach", "/api/coach/access", {
        action: "create_team",
        name: "No",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("coach", "/api/coach/access", {
        action: "invite",
        teamId: "access-api-b",
        role: "assistant_coach",
        email: "test@example.test",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "owner",
        "/api/coach/access",
        { action: "create_team", name: "No" },
        "access-api",
        "https://foreign.example",
      )
    ).status,
    403,
  );
  const r = await call("owner", "/api/coach/access");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.teams.length, 2);
  assert.equal(d.orgRole, "owner");
});
test("unclassified historical data and future APIs fail closed for team coaches", async () => {
  for (const p of [
    "/api/coach/games",
    "/api/coach/play-events?id=anything",
    "/api/coach/lineup?teamId=access-api-b",
    "/api/coach/future",
  ])
    assert.equal((await call("coach", p)).status, 403, p);
});

test("coach game and training flows stay scoped; parents can use assigned recorder links", async () => {
  const config = (team: string, player: string) => ({
    teamId: team,
    teamName: team,
    opponent: "Test opponent",
    date: "2026-09-22",
    usAreHome: true,
    format: "kid_pitch",
    innings: 6,
    roster: [{ id: player, name: player }],
    order: [player],
    opponentOrder: [{ id: "opponent-1", name: "Opponent" }],
    positions: { P: player },
    crewMode: "split",
  });
  const gameAResponse = await call("coach", "/api/coach/live", {
    config: config("access-api-a", "access-api-child"),
  });
  assert.equal(gameAResponse.status, 201);
  const a = (await gameAResponse.json()).game;
  assert.equal(
    (
      await call("coach", "/api/coach/live", {
        config: config("access-api-b", "access-api-private"),
      })
    ).status,
    403,
  );
  const gameBResponse = await call("owner", "/api/coach/live", {
    config: config("access-api-b", "access-api-private"),
  });
  assert.equal(gameBResponse.status, 201);
  const b = (await gameBResponse.json()).game;
  try {
    for (const suffix of ["", "/crew", "/insights"])
      assert.equal(
        (await call("coach", `/api/coach/live/${b.id}${suffix}`)).status,
        403,
      );
    const list = await (await call("coach", "/api/coach/live")).json();
    assert.ok(list.games.every((g: any) => g.config.teamId === "access-api-a"));
    const grantResponse = await call("coach", `/api/coach/live/${a.id}/crew`, {
      lane: "pitch",
      label: "Test parent",
    });
    assert.equal(grantResponse.status, 201);
    const grant = (await grantResponse.json()).grant;
    const recorder = (token: string) =>
      fetch(`${base}/api/coach/live/${a.id}`, {
        headers: {
          cookie: "iw_account=local-access-parent; iw_organization=access-api",
          "x-recording-token": token,
        },
      });
    assert.equal((await recorder("invalid")).status, 403);
    const allowed = await recorder(grant.token);
    assert.equal(allowed.status, 200, await allowed.clone().text());
    assert.equal((await allowed.json()).lane, "pitch");
    const ownPracticeResponse = await call("coach", "/api/coach/training", {
      playerId: "access-api-child",
      scenarioId: "b1",
    });
    assert.equal(ownPracticeResponse.status, 201);
    const own = (await ownPracticeResponse.json()).assignment;
    assert.equal(
      (
        await call("coach", "/api/coach/training", {
          playerId: "access-api-private",
          scenarioId: "b1",
        })
      ).status,
      403,
    );
    const otherPractice = await (
      await call("owner", "/api/coach/training", {
        playerId: "access-api-private",
        scenarioId: "b1",
      })
    ).json();
    assert.equal(
      (
        await call("parent", `/api/coach/training/${own.id}`, {
          id: randomUUID(),
          answer: "CF",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "parent",
          `/api/coach/training/${otherPractice.assignment.id}`,
          { id: randomUUID(), answer: "CF" },
        )
      ).status,
      403,
    );
    const practice = await (await call("coach", "/api/coach/training")).json();
    assert.ok(
      practice.assignments.every(
        (p: any) => p.player_id === "access-api-child",
      ),
    );
    const remove = await call("owner", "/api/coach/access", {
      action: "remove_member",
      teamId: "access-api-a",
      userId: "bbbbbbbb-0000-4000-8000-000000000002",
    });
    assert.equal(remove.status, 200);
    assert.equal(
      (await call("coach", "/api/coach/roster?teamId=access-api-a")).status,
      403,
    );
    assert.equal(
      (await recorder(grant.token)).status,
      403,
      "Staff removal must revoke existing recorder links",
    );
  } finally {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "codex-ninety-feet-db-tests",
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        input: readFileSync("tests/access-api-fixture.sql", "utf8"),
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
  }
});
