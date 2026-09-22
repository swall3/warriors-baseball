import { getPlan, updatePlan, deletePlan } from "@/lib/practice/plans";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const session = await sessionFor(request);
    const plan = await getPlan(session, (await params).planId);
    return reply({ ok: true, plan });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const session = await sessionFor(request, true);
    const plan = await updatePlan(
      session,
      (await params).planId,
      await request.json(),
    );
    return reply({ ok: true, plan });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  try {
    const session = await sessionFor(request, true);
    await deletePlan(session, (await params).planId);
    return reply({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
