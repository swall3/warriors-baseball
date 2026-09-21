// Server-only persistence. Every query is scoped by the verified session.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getSupabaseClient, isSupabaseEnabled } from "@/lib/supabase";
import type { CoachSession } from "@/lib/coach/session";
import {
  applyCommand,
  makeGame,
  mayCommand,
  type Command,
  type Config,
  type Lane,
  type LiveGame,
} from "./model";

export class LiveError extends Error {
  constructor(
    message: string,
    public status: number,
    public state?: LiveGame,
  ) {
    super(message);
  }
}
export function client() {
  if (!isSupabaseEnabled())
    throw new LiveError(
      "Shared games need the database connection. Existing device-only scoring is still available.",
      503,
    );
  return getSupabaseClient();
}
function check(error: { message: string } | null) {
  if (error) {
    console.error("[live-game] database operation failed", error.message);
    throw new LiveError(
      "Shared game storage is unavailable. Your action has not been confirmed.",
      503,
    );
  }
}
export async function getGame(orgId: string, id: string): Promise<LiveGame> {
  const { data, error } = await client()
    .from("live_games")
    .select("state")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  check(error);
  if (!data) throw new LiveError("Game not found", 404);
  return data.state as LiveGame;
}
export async function listGames(orgId: string) {
  const { data, error } = await client()
    .from("live_games")
    .select("state")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(100);
  check(error);
  return (data ?? []).map((r) => r.state as LiveGame);
}
export async function createGame(session: CoachSession, config: Config) {
  if (session.role === "viewer")
    throw new LiveError("Only a coach can prepare a game.", 403);
  let state = makeGame(randomUUID(), config, new Date().toISOString());
  // Resolve team/player identity from the org's existing tables. Display names
  // submitted by a browser never rename or manufacture roster identities.
  const { data: team, error: teamError } = await client()
    .from("teams")
    .select("id,name")
    .eq("org_id", session.orgId)
    .eq("id", config.teamId)
    .maybeSingle();
  check(teamError);
  if (!team) throw new LiveError("Team not found", 404);
  const { data: players, error: playersError } = await client()
    .from("players")
    .select("id,display_name")
    .eq("org_id", session.orgId)
    .eq("team_id", config.teamId)
    .eq("active", true);
  check(playersError);
  if (config.roster.some((p) => !players?.some((row) => row.id === p.id)))
    throw new LiveError("Choose players from this team's roster.", 400);
  state.config.teamName = team.name;
  state.config.roster = state.config.roster.map((p) => ({
    id: p.id,
    name: players!.find((row) => row.id === p.id)!.display_name,
  }));
  state = makeGame(state.id, state.config, state.updatedAt);
  const { error } = await client().from("live_games").insert({
    org_id: session.orgId,
    id: state.id,
    team_id: config.teamId,
    state,
    revision: 0,
  });
  check(error);
  return state;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export type Actor = { lane: Lane; id: string };
export async function actorFor(
  session: CoachSession,
  gameId: string,
  token: string | null,
): Promise<Actor> {
  // A shared-passcode session identifies a role, not a named person. Issued
  // game grants identify a recording device/assignment, not a verified parent.
  if (token) {
    const { data, error } = await client()
      .from("live_game_grants")
      .select("id,lane,expires_at,revoked")
      .eq("org_id", session.orgId)
      .eq("game_id", gameId)
      .eq("token_hash", digest(token))
      .maybeSingle();
    check(error);
    if (!data || data.revoked || Date.parse(data.expires_at) <= Date.now())
      throw new LiveError(
        "This recording assignment has expired or was revoked. Ask the coach for a new link.",
        403,
      );
    return { lane: data.lane as Lane, id: data.id };
  }
  return session.role === "viewer"
    ? { lane: "display", id: "viewer-session" }
    : { lane: "coach", id: `${session.role}-session` };
}
export async function issueGrant(
  session: CoachSession,
  gameId: string,
  lane: Lane,
  label: string,
) {
  if (session.role === "viewer")
    throw new LiveError("Only a coach can assign recorders.", 403);
  await getGame(session.orgId, gameId);
  if (
    !["pitch", "play", "all", "display"].includes(lane) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.length > 80
  )
    throw new LiveError("Choose a role and a short recorder label.", 400);
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString();
  const { error } = await client()
    .from("live_game_grants")
    .insert({
      org_id: session.orgId,
      game_id: gameId,
      id,
      token_hash: digest(token),
      lane,
      label: label.trim(),
      expires_at: expiresAt,
    });
  check(error);
  return { id, token, lane, label: label.trim(), expiresAt };
}
export async function grantList(session: CoachSession, gameId: string) {
  if (session.role === "viewer")
    throw new LiveError("Only a coach can manage recorders.", 403);
  const { data, error } = await client()
    .from("live_game_grants")
    .select("id,lane,label,expires_at,revoked")
    .eq("org_id", session.orgId)
    .eq("game_id", gameId);
  check(error);
  return data ?? [];
}
export async function revokeGrant(
  session: CoachSession,
  gameId: string,
  id: string,
) {
  if (session.role === "viewer")
    throw new LiveError("Only a coach can manage recorders.", 403);
  const { error } = await client()
    .from("live_game_grants")
    .update({ revoked: true })
    .eq("org_id", session.orgId)
    .eq("game_id", gameId)
    .eq("id", id);
  check(error);
}
export async function recordCommand(
  session: CoachSession,
  gameId: string,
  actor: Actor,
  input: { id: string; expectedRevision: number; command: Command },
) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !/^[a-zA-Z0-9_-]{8,100}$/.test(input.id) ||
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  )
    throw new LiveError("A command ID and game revision are required.", 400);
  if (!input.command || typeof input.command.type !== "string")
    throw new LiveError("A game command is required.", 400);
  if (!mayCommand(actor.lane, input.command))
    throw new LiveError("This recording role cannot perform that action.", 403);
  const current = await getGame(session.orgId, gameId);
  const { data: receipt, error } = await client()
    .from("live_game_commands")
    .select("id")
    .eq("org_id", session.orgId)
    .eq("game_id", gameId)
    .eq("id", input.id)
    .maybeSingle();
  check(error);
  // Retry receipts are verified atomically by the RPC (payload + actor). Do
  // not re-run a reducer against a game that already contains this command.
  if (!receipt && current.revision !== input.expectedRevision)
    throw new LiveError(
      "Another recorder updated the game. Review the latest state before applying your action.",
      409,
      current,
    );
  if (!receipt && input.command?.type === "configure") {
    const c = input.command.config;
    if (
      !c ||
      c.roster.length !== current.config.roster.length ||
      c.roster.some(
        (p) =>
          !current.config.roster.some(
            (old) => old.id === p.id && old.name === p.name,
          ),
      )
    )
      throw new LiveError("Use the game's existing roster.", 400);
    if (c.teamName !== current.config.teamName)
      throw new LiveError("Team identity cannot change.", 400);
  }
  const state = receipt
    ? current
    : applyCommand(
        current,
        input.command,
        input.id,
        actor.lane,
        new Date().toISOString(),
      );
  const { data, error: commitError } = await client().rpc(
    "commit_live_game_command",
    {
      p_org: session.orgId,
      p_game: gameId,
      p_id: input.id,
      p_expected: input.expectedRevision,
      p_command: input.command,
      p_state: state,
      p_lane: actor.lane,
      p_actor: actor.id,
    },
  );
  check(commitError);
  if (data.error === "conflict")
    throw new LiveError(
      "Another recorder updated the game. Review your action before retrying.",
      409,
      data.state,
    );
  if (data.error === "id_reused")
    throw new LiveError(
      "This command ID already belongs to a different action.",
      409,
    );
  if (data.error) throw new LiveError("Game not found", 404);
  return { game: data.state as LiveGame, duplicate: Boolean(data.duplicate) };
}
