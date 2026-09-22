import { listPlans, createPlan } from "@/lib/practice/plans";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const teamId = new URL(request.url).searchParams.get("teamId") ?? undefined;
    const plans = await listPlans(session, teamId ?? undefined);
    return reply({ ok: true, plans });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const session = await sessionFor(request, true);
    const plan = await createPlan(session, await request.json());
    return reply({ ok: true, plan }, 201);
  } catch (e) {
    return failure(e);
  }
}
