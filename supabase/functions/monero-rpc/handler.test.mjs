import test from 'node:test';import assert from 'node:assert/strict';
import {createRpcHandler} from './handler.mjs';
function setup(overrides={}){const calls=[];const handler=createRpcHandler({upstreamUrl:'https://owned.example/json_rpc',allowedOrigin:'https://app.example',verifyUser:async()=>({id:'u'}),authorize:async()=>true,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json({result:{height:1}});},...overrides});
 const request=(body,authorization='Bearer valid')=>handler(new Request('https://edge.example',{method:'POST',headers:{'content-type':'application/json',...(authorization?{authorization}:{})},body:JSON.stringify(body)}));return{calls,request};}
test('anonymous/forbidden callers cannot use upstream, even with a valid request',async()=>{
 const a=setup();assert.equal((await a.request({method:'get_info',params:{}},null)).status,401);assert.equal(a.calls.length,0);
 const b=setup({verifyUser:async()=>undefined});assert.equal((await b.request({method:'get_info',params:{}})).status,401);assert.equal(b.calls.length,0);
 const c=setup({authorize:async()=>false});assert.equal((await c.request({method:'get_info',params:{}})).status,403);assert.equal(c.calls.length,0);
});
test('client-controlled internal URL, raw paths and administrative RPC are rejected',async()=>{
 const{calls,request}=setup();for(const payload of [{method:'get_info',params:{},host:'127.0.0.1',port:8080},{method:'get_info',params:{},rawPath:'/internal'},{method:'pop_blocks',params:{nblocks:3}}])assert.equal((await request(payload)).status,400);assert.equal(calls.length,0);
 assert.equal((await request({method:'get_block',params:{height:1}})).status,200);assert.equal(calls[0].url,'https://owned.example/json_rpc');assert.equal(calls[0].options.redirect,'error');
});
test('oversized responses and missing secure upstream fail closed',async()=>{
 const large=setup({fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1))});assert.equal((await large.request({method:'get_info',params:{}})).status,502);
 const missing=setup({upstreamUrl:'http://127.0.0.1/json_rpc'});assert.equal((await missing.request({method:'get_info',params:{}})).status,503);assert.equal(missing.calls.length,0);
});
