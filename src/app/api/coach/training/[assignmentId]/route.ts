import { recordAttempt } from "@/lib/coach/live/training-store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> },
) {
  try {
    return reply({
      ok: true,
      ...(await recordAttempt(
        await sessionFor(request, true),
        (await params).assignmentId,
        await request.json(),
      )),
    });
  } catch (e) {
    return failure(e);
  }
}
