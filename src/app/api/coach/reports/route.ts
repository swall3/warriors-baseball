import {LiveError} from "@/lib/coach/live/store";
import { readReports } from "@/lib/coach/report-store";
import { sessionFor, reply, failure } from "@/lib/coach/live/http";
export async function GET(request: Request) {
  try {
    const session = await sessionFor(request);
    return reply({ ok: true, games: await readReports(session.orgId) });
  } catch (e) {
    if(e instanceof LiveError)return failure(e);
    console.error("[reports] read failed",e);
    return reply({ok:false,error:"Game reports are unavailable. Please retry."},503);
  }
}
