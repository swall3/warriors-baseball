import { checkout } from "@/lib/billing/server";
import { failure, reply } from "@/lib/coach/live/http";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    return reply({ url: await checkout(request, body.interval) });
  } catch (e) {
    return failure(e);
  }
}
