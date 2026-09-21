import { assignments, assignPractice } from "@/lib/coach/live/training-store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    return reply({
      ok: true,
      assignments: await assignments(await sessionFor(request)),
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    return reply(
      {
        ok: true,
        assignment: await assignPractice(
          await sessionFor(request, true),
          await request.json(),
        ),
      },
      201,
    );
  } catch (e) {
    return failure(e);
  }
}
