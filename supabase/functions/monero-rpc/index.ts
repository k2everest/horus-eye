import {createRpcHandler,readBounded} from './handler.mjs';

const supabaseUrl=Deno.env.get('SUPABASE_URL');
const key=Deno.env.get('SUPABASE_ANON_KEY');
async function authRequest(path:string,authorization:string,body?:unknown){
 if(!supabaseUrl||!key)throw new Error('AUTH_NOT_CONFIGURED');
 const response=await fetch(supabaseUrl+path,{method:body?'POST':'GET',redirect:'error',headers:{apikey:key,authorization,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)return undefined;return JSON.parse(await readBounded(response.body,65536));
}
Deno.serve(createRpcHandler({
 upstreamUrl:Deno.env.get('AEGIS_MONERO_RPC_URL'),
 upstreamAuthorization:Deno.env.get('AEGIS_MONERO_RPC_AUTHORIZATION'),
 allowedOrigin:Deno.env.get('AEGIS_WEB_ORIGIN'),
 verifyUser:(authorization:string)=>authRequest('/auth/v1/user',authorization),
 authorize:(user:{id:string},authorization:string)=>authRequest('/rest/v1/rpc/has_permission',authorization,{_user_id:user.id,_perm:'view_monitor'}).then(result=>result===true),
}));
