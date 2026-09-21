import {createGame,listGames} from "@/lib/coach/live/store";
import {failure,reply,sessionFor} from "@/lib/coach/live/http";
export async function GET(request:Request){try{const session=await sessionFor(request);return reply({ok:true,games:await listGames(session.orgId)});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const session=await sessionFor(request,true);const body=await request.json();return reply({ok:true,game:await createGame(session,body.config)},201);}catch(e){return failure(e);}}
