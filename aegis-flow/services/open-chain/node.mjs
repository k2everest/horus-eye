import http from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
import {OpenChain} from './chain.mjs';
import {peerOrigin,publicRequest,syncPeer} from './network.mjs';
import {RequestLimits} from '../operational-security/access.mjs';
import {assertDemoRuntime} from '../validation-gateway/runtime-policy.mjs';
export class OpenNode {
 #chain;#server;#peers;#pool=new Map();#poolBytes=0;#working=false;#timer;#closed=false;
 constructor({chain,peers=[],sink=()=>{}}){
  assertDemoRuntime();if(!Array.isArray(peers)||peers.length>16)throw new Error('POW_PEER_LIMIT');this.#chain=chain;this.#peers=[...new Set(peers.map(peerOrigin))];
  const limits=new RequestLimits({perIp:600,global:1200});let bodies=0;
  this.#server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
   const reply=(status,value)=>{if(res.destroyed||res.writableEnded)return;res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));};
   if(!limits.connection(req.socket.remoteAddress)){req.resume();reply(429,{error:'POW_RATE_LIMIT'});return;}
   try{
    if(req.method==='OPTIONS'){reply(204,{});return;}
    if(req.method==='GET'){
     if(req.url==='/healthz'){reply(200,{status:'ok',mode:'experimental-open-pow',production_ready:false});return;}
     if(req.url==='/chain/status'){reply(200,chain.status());return;}
     if(req.url==='/chain/genesis'){reply(200,chain.config);return;}
     const block=req.url?.match(/^\/chain\/blocks\/([1-9][0-9]{0,9})$/);if(block){const b=chain.blockAt(Number(block[1]));reply(b?200:404,b??{error:'NOT_FOUND'});return;}
     const height=req.url?.match(/^\/chain\/hash\/([0-9]{1,10})$/);if(height){const hash=chain.hashAt(Number(height[1]));reply(hash?200:404,hash?{hash}:{error:'NOT_FOUND'});return;}
     const receipt=req.url?.match(/^\/receipts\/([A-Za-z0-9_-]{1,128})$/);if(receipt){const r=chain.transactionReceipt(receipt[1]);reply(r?200:404,r??{error:'NOT_FOUND'});return;}
     if(req.url==='/mempool/next'){reply(200,this.#pool.values().next().value?.body??null);return;}
     reply(404,{error:'NOT_FOUND'});return;
    }
    if(req.method!=='POST'||!['/submit','/p2p/transaction','/p2p/block'].includes(req.url)){req.resume();reply(404,{error:'NOT_FOUND'});return;}
    if(this.#working||bodies>=4){req.resume();reply(503,{error:'POW_VALIDATOR_BUSY'});return;}
    if(req.headers['content-type']?.split(';')[0]!=='application/json'){req.resume();reply(415,{error:'JSON_REQUIRED'});return;}
    bodies++;let body;
    try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new Error('POW_BODY_LIMIT');chunks.push(chunk);}body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}finally{bodies--;}
    if(this.#working){reply(503,{error:'POW_VALIDATOR_BUSY'});return;}
    this.#working=true;
    try{
     if(req.url==='/p2p/block'){
      if(!body||Object.keys(body).join(',')!=='block')throw new Error('BLOCK_REQUIRED');
      const before=chain.blocks();const result=await chain.addBlock(body.block);if(result.best_changed)await this.#refresh(before);
      reply(200,result);if(!result.replayed)void this.#gossip('/p2p/block',body);
     }else{
      if(!body||Object.keys(body).sort().join(',')!=='proof,transaction')throw new Error('TRANSACTION_AND_PROOF_REQUIRED');
      const result=await this.#admit(body);reply(200,result);if(!result.replayed)void this.#gossip('/p2p/transaction',body);
     }
    }finally{this.#working=false;}
   }catch(error){try{sink(JSON.stringify({event:'open_pow_rejection',code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'INVALID_REQUEST'}));}catch{}
    reply(400,{error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'INVALID_REQUEST'});
   }
  });
  this.#server.maxConnections=128;this.#server.maxRequestsPerSocket=100;this.#server.requestTimeout=15000;this.#server.headersTimeout=10000;this.#server.timeout=15000;this.#server.keepAliveTimeout=5000;
 }
 get chain(){return this.#chain;}
 get origin(){const a=this.#server.address();if(!a)throw new Error('POW_NODE_NOT_LISTENING');return`http://127.0.0.1:${a.port}`;}
 addPeer(origin){origin=peerOrigin(origin);if(!this.#peers.includes(origin)){if(this.#peers.length>=16)throw new Error('POW_PEER_LIMIT');this.#peers.push(origin);}}
 async #admit(body){
  const id=body.transaction?.tx_id;if(this.#pool.has(id)){if(canonicalSerialize(this.#pool.get(id).body)!==canonicalSerialize(body))throw new Error('POW_REPLAY_BODY_MISMATCH');return{accepted:true,replayed:true,status:'MEMPOOL',settled:false};}
  const bytes=Buffer.byteLength(JSON.stringify(body));if(this.#pool.size>=64||this.#poolBytes+bytes>32*1024*1024)throw new Error('POW_MEMPOOL_LIMIT');
  const included=body.transaction?.request_id?this.#chain.transactionReceipt(body.transaction.request_id):undefined;
  if(included&&included.transaction_id===id){const b=this.#chain.blockAt(included.height);if(canonicalSerialize({transaction:b.transaction,proof:b.proof})!==canonicalSerialize(body))throw new Error('POW_REPLAY_BODY_MISMATCH');return{accepted:true,replayed:true,status:included.status,receipt:included,settled:false};}
  await this.#chain.validateTransaction(body.transaction,body.proof);this.#pool.set(id,{body:structuredClone(body),bytes});this.#poolBytes+=bytes;
  return{accepted:true,replayed:false,status:'MEMPOOL',transaction_id:id,settled:false,production_ready:false};
 }
 async #refresh(previous){
  const current=this.#chain.blocks(),present=new Set(current.map(b=>b.transaction?.tx_id).filter(Boolean));
  const candidates=[...this.#pool.values()].map(v=>v.body);
  for(const b of previous)if(b.transaction&&!present.has(b.transaction.tx_id))candidates.push({transaction:b.transaction,proof:b.proof});
  this.#pool.clear();this.#poolBytes=0;
  for(const body of candidates){if(present.has(body.transaction.tx_id))continue;try{await this.#admit(body);}catch{/* Orphaned/stale spends are not silently accepted. */}}
 }
 async #gossip(path,body){await Promise.allSettled(this.#peers.map(peer=>publicRequest(peer,path,body,{timeoutMs:5000})));}
 async sync(){if(this.#working)return;this.#working=true;try{for(const peer of this.#peers){const before=this.#chain.blocks(),beforeHash=this.#chain.tip.hash;try{await syncPeer(this.#chain,peer);if(this.#chain.tip.hash!==beforeHash)await this.#refresh(before);}catch{/* A peer cannot override local validation. */}}}finally{this.#working=false;}}
 async mine(ownerTag,options={}){
  if(this.#working)throw new Error('POW_VALIDATOR_BUSY');this.#working=true;
  try{const before=this.#chain.blocks(),candidate=this.#pool.values().next().value?.body??{};
   const block=await this.#chain.mine({ownerTag,...candidate,...options});await this.#refresh(before);await this.#gossip('/p2p/block',{block});return block;
  }finally{this.#working=false;}
 }
 async listen(port=0,host='127.0.0.1',{syncIntervalMs=5000}={}){
  if(!Number.isSafeInteger(syncIntervalMs)||syncIntervalMs<100||syncIntervalMs>60000)throw new Error('INVALID_POW_SYNC_INTERVAL');
  this.#server.listen(port,host);await once(this.#server,'listening');this.#timer=setInterval(()=>{void this.sync();},syncIntervalMs);this.#timer.unref();return this;
 }
 async close(){if(this.#closed)return;clearInterval(this.#timer);this.#server.closeAllConnections();await new Promise(resolve=>this.#server.close(resolve));
  while(this.#working)await new Promise(resolve=>setTimeout(resolve,10));this.#chain.close();this.#closed=true;
 }
}
export async function startOpenNode(env=process.env){
 assertDemoRuntime(env);if(!env.AEGIS_POW_GENESIS)throw new Error('POW_GENESIS_FILE_REQUIRED');
 const config=JSON.parse(readFileSync(env.AEGIS_POW_GENESIS,'utf8'));const chain=await OpenChain.open({directory:env.AEGIS_POW_DIR??'work/open-pow-node',config});
 const peers=env.AEGIS_POW_PEERS?JSON.parse(env.AEGIS_POW_PEERS):[];let node;
 try{node=new OpenNode({chain,peers,sink:console.log});await node.listen(Number(env.PORT??8090),env.AEGIS_BIND_HOST??'127.0.0.1');}catch(error){chain.close();throw error;}
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void node.close();});console.log(JSON.stringify({event:'open_pow_node_started',network:chain.status().config_id,port:Number(env.PORT??8090),monetary_authority:null,production_ready:false}));return node;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await startOpenNode();
