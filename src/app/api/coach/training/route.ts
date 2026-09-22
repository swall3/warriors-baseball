import { after } from "next/server";
import { safelyDeliver } from "@/lib/notifications/server";
import {
  assignments,
  assignPractice,
  bundleAssignments,
} from "@/lib/coach/live/training-store";
import { failure, reply, sessionFor } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    const [rows, bundles] = await Promise.all([
      assignments(session),
      bundleAssignments(session),
    ]);
    return reply({ ok: true, assignments: rows, bundles });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const session = await sessionFor(request, true);
    const assignment = await assignPractice(session, await request.json());
    after(() => safelyDeliver(session.orgId));
    return reply({ ok: true, assignment }, 201);
  } catch (e) {
    return failure(e);
  }
}
