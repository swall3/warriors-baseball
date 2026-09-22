import { portal } from "@/lib/billing/server";
import { failure, reply } from "@/lib/coach/live/http";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return reply({ url: await portal(request, body.team) });
  } catch (e) {
    return failure(e);
  }
}
