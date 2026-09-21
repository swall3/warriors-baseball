// Local-only proxy for the disposable PostgREST review stack. No production secrets.
import http from 'node:http';
const host='127.0.0.1';
http.createServer((req,res)=>{
 if(!req.url.startsWith('/rest/v1')){res.writeHead(404);res.end();return;}
 const upstream=http.request({hostname:host,port:54389,path:req.url.slice('/rest/v1'.length)||'/',method:req.method,headers:req.headers},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
 upstream.on('error',()=>{res.writeHead(503);res.end('Local review database unavailable');});req.pipe(upstream);
}).listen(54390,host,()=>console.log('Local review REST proxy listening on 127.0.0.1:54390'));
