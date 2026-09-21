import {actorFor,getGame,recordCommand} from "@/lib/coach/live/store";
import {failure,reply,sessionFor} from "@/lib/coach/live/http";
type Context={params:Promise<{gameId:string}>};
export async function GET(request:Request,context:Context){try{const session=await sessionFor(request);const {gameId}=await context.params;const actor=await actorFor(session,gameId,request.headers.get("x-recording-token"));return reply({ok:true,game:await getGame(session.orgId,gameId),lane:actor.lane});}catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){try{const session=await sessionFor(request,true);const {gameId}=await context.params;const actor=await actorFor(session,gameId,request.headers.get("x-recording-token"));return reply({ok:true,...await recordCommand(session,gameId,actor,await request.json())});}catch(e){return failure(e);}}
