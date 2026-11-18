import {setTimeout as pause} from 'node:timers/promises';
import {openNetworkId} from './consensus.mjs';
export function peerOrigin(value){const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.origin!==value||u.username||u.password)throw new Error('INVALID_POW_PEER_ORIGIN');return u.origin;}
export function miningCandidate(value){
 if(value===null)return{transaction:null,proof:null};
 if(!value||Array.isArray(value)||Object.keys(value).sort().join(',')!=='proof,transaction'||!value.transaction||!value.proof)throw new Error('INVALID_POW_MEMPOOL_CANDIDATE');
 // Public peer data must never override local mining options/reward ownership.
 return{transaction:structuredClone(value.transaction),proof:structuredClone(value.proof)};
}
export async function publicRequest(origin,path,body,{timeoutMs=10000}={}){
 const response=await fetch(peerOrigin(origin)+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:body===undefined?{}:{'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(timeoutMs)});
 if(!response.body)throw new Error('POW_PEER_EMPTY_RESPONSE');const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>16*1024*1024)throw new Error('POW_PEER_RESPONSE_LIMIT');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel();}
 if(!response.ok)throw new Error(`POW_PEER_HTTP_${response.status}`);return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function syncPeer(chain,origin,{maxBlocks=16,onBestChanged}={}){
 if(!Number.isSafeInteger(maxBlocks)||maxBlocks<1||maxBlocks>256)throw new Error('INVALID_POW_SYNC_BUDGET');
 const remote=await publicRequest(origin,'/chain/status');
 if(remote.config_id!==openNetworkId(chain.config)||!Number.isSafeInteger(remote.tip?.height)||remote.tip.height<0||remote.tip.height>10000000)throw new Error('POW_PEER_NETWORK_MISMATCH');
 // Continue a downloaded side branch even before its work beats the local tip.
 // Restricting this search to the local canonical branch would repeatedly fetch
 // the first batch of a long competing fork and never reach its winning suffix.
 let low=0,high=remote.tip.height;
 while(low<high){const middle=Math.ceil((low+high)/2);const response=await publicRequest(origin,`/chain/hash/${middle}`);if(chain.has(response.hash))low=middle;else high=middle-1;}
 let imported=0;
 for(let height=low+1;height<=remote.tip.height&&imported<maxBlocks;height++){
  const block=await publicRequest(origin,`/chain/blocks/${height}`);
  if(block?.header?.height!==height)throw new Error('POW_PEER_BLOCK_HEIGHT_MISMATCH');
  const before=chain.tip.hash;const result=await chain.addBlock(block);imported++;
  if(result.best_changed&&onBestChanged)await onBestChanged(before);
 }
 return{imported,tip:chain.tip};
}
export async function waitForPeer(origin,{attempts=50}={}){for(let i=0;i<attempts;i++){try{await publicRequest(origin,'/healthz');return;}catch{await pause(100);}}throw new Error('POW_PEER_UNAVAILABLE');}
