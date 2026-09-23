// Disposable, loopback-only test auth service. Never used by deployed code.
import http from 'node:http';
const ids={owner:'bbbbbbbb-0000-4000-8000-000000000001',coach:'bbbbbbbb-0000-4000-8000-000000000002',parent:'bbbbbbbb-0000-4000-8000-000000000003',other:'bbbbbbbb-0000-4000-8000-000000000004',newcoach:'cccccccc-0000-4000-8000-000000000001',newparent:'cccccccc-0000-4000-8000-000000000002'};
const user=(name)=>({id:ids[name],email:`${name}@access.example.test`,email_confirmed_at:new Date().toISOString(),is_anonymous:false,aud:'authenticated',role:'authenticated',created_at:new Date().toISOString(),app_metadata:{},user_metadata:{}});
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/rest/v1')){
    const upstream=http.request({hostname:'127.0.0.1',port:54389,path:req.url.slice(8)||'/',method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
    upstream.on('error',()=>{res.writeHead(503);res.end();});req.pipe(upstream);return;
  }
  const send=(body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
  const name=req.headers.authorization?.replace('Bearer local-access-','');
  if(req.url==='/auth/v1/user' && ids[name])return send(user(name));
  const id=req.url.split('/').pop();
  if(req.url.startsWith('/auth/v1/admin/users/')){const n=Object.keys(ids).find(k=>ids[k]===id);if(n)return send(user(n));}
  let body='';for await(const c of req)body+=c;
  let b={};try{b=JSON.parse(body);}catch{}
  if(req.url==='/auth/v1/otp')return send({});
  if(req.url==='/auth/v1/verify'&&b.token==='000000'){
    const n=Object.keys(ids).find(n=>b.email===`${n}@access.example.test`);
    if(n)return send({access_token:`local-access-${n}`,refresh_token:`refresh-${n}`,expires_in:3600,token_type:'bearer',user:user(n)});
  }
  send({message:'Local test identity unavailable'},401);
}).listen(54391,'127.0.0.1',()=>console.log('Disposable access-test auth listening on 127.0.0.1:54391'));
