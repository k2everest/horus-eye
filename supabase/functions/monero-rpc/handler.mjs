const METHODS=new Set(['get_info','get_block_count','get_block']);
export async function readBounded(body,maxBytes,timeoutMs=5000){
 if(!body)throw Error('EMPTY_BODY');const reader=body.getReader(),chunks=[];let size=0,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},timeoutMs);
 try{for(;;){const p=await reader.read();if(timedOut)throw Error('TIMEOUT');if(p.done)break;size+=p.value.length;if(size>maxBytes)throw Error('BODY_LIMIT');chunks.push(p.value);}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return new TextDecoder().decode(bytes);
 }finally{clearTimeout(timer);await reader.cancel().catch(()=>{});}
}
export function createRpcHandler({verifyUser,authorize,upstreamUrl,upstreamAuthorization,allowedOrigin,fetchImpl=fetch}){
 let upstream;try{const u=new URL(upstreamUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/json_rpc')throw Error();upstream=u.href;}catch{/* Missing configuration fails closed below. */}
 if(upstreamAuthorization&&!/^(Bearer|Basic) [A-Za-z0-9+/=._-]+$/.test(upstreamAuthorization))throw Error('INVALID_UPSTREAM_AUTHORIZATION');
 let active=0;const users=new Map();let globalCount=0,until=0;
 return async req=>{
  const cors=req.headers.get('origin')===allowedOrigin?{'access-control-allow-origin':allowedOrigin,'vary':'Origin','access-control-allow-headers':'authorization,apikey,content-type,x-client-info','access-control-allow-methods':'POST,OPTIONS'}:{};
  const reply=(status,value)=>new Response(status===204?null:JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'}});
  if(req.headers.get('origin')&&req.headers.get('origin')!==allowedOrigin)return reply(403,{error:'ORIGIN_FORBIDDEN'});
  if(req.method==='OPTIONS')return reply(204,{});if(req.method!=='POST')return reply(405,{error:'POST_REQUIRED'});
  if(!upstream)return reply(503,{error:'RPC_UPSTREAM_NOT_CONFIGURED'});
  if(active>=4)return reply(429,{error:'RPC_CAPACITY'});active++;
  try{
   const now=Date.now();if(now>=until){until=now+60000;globalCount=0;users.clear();}if(++globalCount>300)return reply(429,{error:'RPC_RATE_LIMIT'});
   const header=req.headers.get('authorization');if(!header||header.length>8192||!/^Bearer [A-Za-z0-9._-]+$/.test(header))return reply(401,{error:'AUTHENTICATION_REQUIRED'});
   const user=await verifyUser(header);if(!user?.id)return reply(401,{error:'AUTHENTICATION_REQUIRED'});
   const used=(users.get(user.id)??0)+1;users.set(user.id,used);if(used>60)return reply(429,{error:'RPC_RATE_LIMIT'});
   if(!await authorize(user,header))return reply(403,{error:'PERMISSION_REQUIRED'});
   if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON_REQUIRED'});
   const body=JSON.parse(await readBounded(req.body,16384));
   if(!body||Object.keys(body).sort().join(',')!=='method,params'||!METHODS.has(body.method)||!body.params||Array.isArray(body.params)||typeof body.params!=='object')return reply(400,{error:'READ_ONLY_RPC_REQUIRED'});
   if(body.method==='get_block'){if(Object.keys(body.params).join(',')!=='height'||!Number.isSafeInteger(body.params.height)||body.params.height<0)return reply(400,{error:'INVALID_HEIGHT'});}
   else if(Object.keys(body.params).length)return reply(400,{error:'EMPTY_PARAMS_REQUIRED'});
   const response=await fetchImpl(upstream,{method:'POST',redirect:'error',headers:{'content-type':'application/json',...(upstreamAuthorization?{authorization:upstreamAuthorization}:{})},body:JSON.stringify({jsonrpc:'2.0',id:'0',method:body.method,params:body.params}),signal:AbortSignal.timeout(8000)});
   const text=await readBounded(response.body,2*1024*1024);if(!response.ok)return reply(502,{error:'UPSTREAM_REJECTED'});
   return reply(200,{status:200,data:JSON.parse(text)});
  }catch{return reply(502,{error:'RPC_REQUEST_FAILED'});}finally{active--;}
 };
}
