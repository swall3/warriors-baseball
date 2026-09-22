import { createCustomDrill, listCustomDrills } from "@/lib/practice/custom-drills";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";

export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const url = new URL(request.url);
    const drills = await listCustomDrills(
      session,
      url.searchParams.get("teamId") ?? undefined,
      url.searchParams.get("archived") === "1",
    );
    return reply({ ok: true, drills });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await sessionFor(request, true);
    const drill = await createCustomDrill(session, await request.json());
    return reply({ ok: true, drill }, 201);
  } catch (error) {
    return failure(error);
  }
}
