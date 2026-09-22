import {
  getCustomDrill,
  setCustomDrillArchived,
  updateCustomDrill,
} from "@/lib/practice/custom-drills";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ drillId: string }> },
) {
  try {
    const session = await sessionFor(request);
    return reply({ ok: true, drill: await getCustomDrill(session, (await params).drillId) });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ drillId: string }> },
) {
  try {
    const session = await sessionFor(request, true);
    const body = await request.json();
    const id = (await params).drillId;
    const drill =
      typeof body.archived === "boolean"
        ? await setCustomDrillArchived(session, id, body.archived)
        : await updateCustomDrill(session, id, body);
    return reply({ ok: true, drill });
  } catch (error) {
    return failure(error);
  }
}
