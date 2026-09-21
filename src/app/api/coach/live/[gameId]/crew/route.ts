import {grantList,issueGrant,revokeGrant} from "@/lib/coach/live/store";
import {failure,reply,sessionFor} from "@/lib/coach/live/http";
type Context={params:Promise<{gameId:string}>};
export async function GET(request:Request,context:Context){try{const session=await sessionFor(request);return reply({ok:true,grants:await grantList(session,(await context.params).gameId)});}catch(e){return failure(e);}}
export async function POST(request:Request,context:Context){try{const session=await sessionFor(request,true);const body=await request.json();return reply({ok:true,grant:await issueGrant(session,(await context.params).gameId,body.lane,body.label)},201);}catch(e){return failure(e);}}
export async function DELETE(request:Request,context:Context){try{const session=await sessionFor(request,true);const body=await request.json();if(typeof body.id!=="string")return reply({ok:false,error:"Grant ID required"},400);await revokeGrant(session,(await context.params).gameId,body.id);return reply({ok:true});}catch(e){return failure(e);}}
