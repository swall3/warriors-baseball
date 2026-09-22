import { requireCoach } from "@/lib/coach/auth";
import { GameRuleError } from "./model";
import { LiveError } from "./store";
import { authorizeRequest } from "@/lib/access/authorize";
export const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
export async function sessionFor(request: Request, mutation = false) {
  const session = await requireCoach();
  if (!session) throw new LiveError("Unauthorized", 401);
  if (mutation) {
    // Next's internal request URL may use 0.0.0.0 behind the local listener or
    // an internal host behind a deployment proxy. Compare the browser origin
    // to the actual Host header, never a client-supplied forwarded-host value.
    let origin: URL | null = null;
    try {
      origin = new URL(request.headers.get("origin") ?? "");
    } catch {
      /* deny below */
    }
    if (
      !origin ||
      !["http:", "https:"].includes(origin.protocol) ||
      origin.host !== (request.headers.get("host") ?? new URL(request.url).host)
    )
      throw new LiveError("Open this action from the coaching app.", 403);
  }
  await authorizeRequest(session, request);
  return session;
}
export function failure(e: unknown) {
  if (e instanceof LiveError)
    return reply({ ok: false, error: e.message, game: e.state }, e.status);
  if (
    e instanceof GameRuleError ||
    e instanceof SyntaxError ||
    e instanceof TypeError
  )
    return reply(
      {
        ok: false,
        error: e instanceof GameRuleError ? e.message : "Invalid game command.",
      },
      400,
    );
  console.error("[live-game] unexpected error", e);
  return reply(
    {
      ok: false,
      error: "Unable to confirm this action. Retry with the same command.",
    },
    500,
  );
}
