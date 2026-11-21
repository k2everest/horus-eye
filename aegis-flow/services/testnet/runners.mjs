import { setTimeout as pause } from 'node:timers/promises';
import { join } from 'node:path';
import { readBearerSecret } from '../operational-security/access.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
import { verifyTransferSignature, statementForTransfer } from '../../libs/crypto-core/transfer-v2.mjs';
import { settlementConfigId } from '../ledger-state/finality.mjs';
import { assertCampaign, savePublicEvidence, verifyFinalizedBundle } from './evidence.mjs';
async function boundedJson(response) {
  if(!response.body)throw new Error('EMPTY_RESPONSE');
  const reader=response.body.getReader();const chunks=[];let bytes=0;
  try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>16*1024*1024)throw new Error('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(part.value));}}
  finally{await reader.cancel();}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function integer(value,min,max){if(!Number.isSafeInteger(value)||value<min||value>max)throw new Error('INVALID_RUN_BUDGET');}
export class PairedWalletAgent {
  #origin;#tokenFile;#fetch;
  constructor({origin='http://127.0.0.1:8765',tokenFile,fetchImpl=fetch}) {
    const url=new URL(origin);if(url.origin!==origin||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('WALLET_AGENT_MUST_BE_LOOPBACK');
    this.#origin=origin;this.#tokenFile=tokenFile;this.#fetch=fetchImpl;
  }
  async call(path,body){
    if(!['/status','/sync','/send','/retry'].includes(path)&&!/^\/transfers\/[A-Za-z0-9_-]{1,128}$/.test(path))throw new Error('UNSUPPORTED_WALLET_AGENT_OPERATION');
    const response=await this.#fetch(this.#origin+path,{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:`Bearer ${readBearerSecret(this.#tokenFile)}`,
      ...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(660_000)});
    if(response.status===404)return undefined;
    if(!response.ok)throw new Error('WALLET_AGENT_UNAVAILABLE');
    return boundedJson(response);
  }
}
export async function runFreshTransfers({campaign,config,agent,journal,artifactDirectory,count=1,assetId='AEGIS',amount='1',pollMs=10000,finalityTimeoutMs=600000,backend=defaultStarkBackend()}){
  assertCampaign(campaign);integer(count,1,100000);integer(pollMs,10,60000);integer(finalityTimeoutMs,100,86400000);
  if(campaign.config_id!==settlementConfigId(config))throw new Error('CAMPAIGN_CONFIG_MISMATCH');
  const result={workload:'fresh-prove-submit-finalize',requested:count,submitted:0,finalized:0,production_ready:false};
  for(let index=0;index<count;index++){
    let state=await agent.call('/sync',{});
    if(!state||state.locked||!state.synchronized||state.busy||state.config_id!==campaign.config_id)throw new Error('WALLET_NOT_SYNCHRONIZED_OR_UNLOCKED');
    if(state.pending?.length)throw new Error('PENDING_TRANSFER_REQUIRES_OPERATOR');
    const startHeight=state.finalized.height;
    const started=performance.now();
    state=await agent.call('/send',{recipient:state.address,assetId,amount});
    if(!state||state.pending?.length!==1)throw new Error('FRESH_SUBMISSION_NOT_OBSERVED');
    const pending=state.pending[0];result.submitted++;
    journal.append('submitted',{request_id:pending.request_id,tx_id:pending.transaction_id,start_height:startHeight,elapsed_ms:Math.round(performance.now()-started)});
    const waitStarted=performance.now();let evidence;
    while(performance.now()-waitStarted<finalityTimeoutMs){
      await agent.call('/sync',{});
      evidence=await agent.call(`/transfers/${pending.request_id}`);
      if(evidence)break;
      await pause(pollMs);
    }
    if(!evidence){journal.append('failure',{stage:'finality',code:'FINALITY_TIMEOUT'});break;}
    const verified=await verifyFinalizedBundle({bundle:evidence,config,backend});
    if(verified.tx_id!==pending.transaction_id || verified.height <= startHeight || verified.height <= campaign.start_anchor.height)throw new Error('FRESH_TRANSACTION_MISMATCH');
    const artifact_sha256=savePublicEvidence(join(artifactDirectory,`${verified.tx_id}.json`),evidence);
    journal.append('finalized',{...verified,elapsed_ms:Math.round(performance.now()-started),artifact_sha256});result.finalized++;
  }
  return result;
}
export async function runReplayLoad({campaign,config,corpus,tokenFile,journal,attempts=10,intervalMs=6000,budget='nominal',backend=defaultStarkBackend(),fetchImpl=fetch}){
  assertCampaign(campaign);integer(attempts,1,100000);integer(intervalMs,100,3600000);
  if(!['nominal','stress'].includes(budget)||!Array.isArray(corpus)||corpus.length<1||corpus.length>64)throw new Error('INVALID_REPLAY_CORPUS');
  if(campaign.config_id!==settlementConfigId(config))throw new Error('CAMPAIGN_CONFIG_MISMATCH');
  const verified=[];const ids=new Set();
  for(const item of corpus){
    if(!verifyTransferSignature(item.transaction)||item.transaction.network_id!==config.network_id||ids.has(item.transaction.tx_id))throw new Error('INVALID_OR_DUPLICATE_REPLAY_TRANSACTION');
    const result=await backend.verify({statement:statementForTransfer(item.transaction),proof:item.proof});
    if(!result.valid||result.program_id!==config.program_id)throw new Error('REPLAY_CORPUS_REQUIRES_REAL_STARK');
    ids.add(item.transaction.tx_id);verified.push({item,digest:result.proof_digest});
  }
  const result={workload:'replay-verifier-load',attempts,accepted:0,rejected:0,transport_errors:0,fresh_transactions_counted:0};
  for(let index=0;index<attempts;index++){
    const {item,digest}=verified[index%verified.length];const started=performance.now();let status=0;let accepted=false;
    try{
      const response=await fetchImpl(campaign.target_origin+'/submit',{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${readBearerSecret(tokenFile)}`},
        body:JSON.stringify({transaction:item.transaction,proof:item.proof}),signal:AbortSignal.timeout(30000)});
      status=response.status;const payload=await boundedJson(response);
      if(response.ok&&payload.valid===true&&payload.receipt?.transaction_id===item.transaction.tx_id&&payload.receipt?.proof_audit?.proof_digest===digest&&payload.receipt?.proof_audit?.program_id===config.program_id){result.accepted++;accepted=true;}else result.rejected++;
    }catch{result.transport_errors++;}
    journal.append('replay',{tx_id:item.transaction.tx_id,proof_digest:digest,http_status:status,latency_ms:Math.round(performance.now()-started),budget,accepted});
    if(index+1<attempts)await pause(intervalMs);
  }
  return result;
}
export async function observeGateway({campaign,journal,durationMs=60000,intervalMs=30000,fetchImpl=fetch,signal}){
  assertCampaign(campaign);integer(durationMs,100,31*86400000);integer(intervalMs,100,60000);
  const deadline=performance.now()+durationMs;let samples=0;
  do{
    const started=performance.now();let ok=false;
    try{const response=await fetchImpl(campaign.target_origin+'/healthz',{redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});await response.body?.cancel();ok=response.ok;}catch{/* Failed probes count as failures. */}
    if(signal?.aborted)break;
    journal.append('heartbeat',{ok,latency_ms:Math.round(performance.now()-started)});samples++;
    if(performance.now()<deadline&&!signal?.aborted){try{await pause(Math.min(intervalMs,Math.max(1,deadline-performance.now())),undefined,{signal});}catch{if(!signal?.aborted)throw new Error('OBSERVER_WAIT_FAILED');}}
  }while(performance.now()<deadline&&!signal?.aborted);
  return{samples,observation:'liveness-only',production_ready:false};
}
