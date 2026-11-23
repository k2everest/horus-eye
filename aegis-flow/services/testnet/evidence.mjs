import crypto from 'node:crypto';
import { openSync, writeSync, fsyncSync, closeSync, createReadStream, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { canonicalSerialize, buildTranscriptHash } from '../../libs/crypto-core/canonical-transcript.mjs';
import { verifyTransferSignature, statementForTransfer } from '../../libs/crypto-core/transfer-v2.mjs';
import { settlementConfigId, verifyFinalityCertificate } from '../ledger-state/finality.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
const hash = value => crypto.createHash('sha256').update(canonicalSerialize(value)).digest('hex');
const fields = {
  header: ['campaign_id','config_id','environment','image_ref','observer_id','start_anchor','target_origin'],
  heartbeat: ['ok','latency_ms'],
  replay: ['tx_id','proof_digest','http_status','latency_ms','budget','accepted'],
  submitted: ['request_id','tx_id','elapsed_ms','start_height'],
  finalized: ['request_id','tx_id','checkpoint_id','height','proof_digest','elapsed_ms','artifact_sha256'],
  failure: ['stage','code'],
};
export function assertCampaign(campaign) {
  if (!campaign || Object.keys(campaign).sort().join(',') !== 'campaign_id,config_id,environment,image_ref,schema,start_anchor,target_origin' || campaign.schema !== 'AEGIS_TESTNET_CAMPAIGN_V1' ||
    typeof campaign.campaign_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(campaign.campaign_id) || !/^[0-9a-f]{64}$/.test(campaign.config_id) ||
    !['local-rehearsal','public-testnet'].includes(campaign.environment)) throw new Error('INVALID_CAMPAIGN');
  if (!campaign.start_anchor || Object.keys(campaign.start_anchor).sort().join(',') !== 'checkpoint_id,height' || !Number.isSafeInteger(campaign.start_anchor.height) || campaign.start_anchor.height < 0 || !/^[0-9a-f]{64}$/.test(campaign.start_anchor.checkpoint_id)) throw new Error('TRUSTED_START_ANCHOR_REQUIRED');
  if (!/^(?:sha256:[0-9a-f]{64}|[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64})$/.test(campaign.image_ref) && !(campaign.environment === 'local-rehearsal' && campaign.image_ref === 'unreleased-local')) throw new Error('CAMPAIGN_REQUIRES_IMMUTABLE_RELEASE');
  const url = new URL(campaign.target_origin);
  if (url.origin !== campaign.target_origin || url.username || url.password ||
    (url.protocol !== 'https:' && !(campaign.environment === 'local-rehearsal' && url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw new Error('CAMPAIGN_REQUIRES_HTTPS_OR_LOCAL_REHEARSAL');
  if (campaign.environment === 'public-testnet' && (['localhost','127.0.0.1','[::1]'].includes(url.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname))) throw new Error('PUBLIC_CAMPAIGN_REQUIRES_PUBLIC_TARGET');
  return campaign;
}
function assertEvent(kind,payload) {
  if (!fields[kind] || !payload || Object.keys(payload).sort().join(',') !== [...fields[kind]].sort().join(',')) throw new Error('INVALID_EVIDENCE_FIELDS');
  for (const [name,value] of Object.entries(payload)) {
    if (['latency_ms','elapsed_ms','height','start_height','http_status'].includes(name) && (!Number.isSafeInteger(value) || value < 0)) throw new Error('INVALID_EVIDENCE_NUMBER');
    if (['tx_id','proof_digest','checkpoint_id','artifact_sha256','config_id'].includes(name) && (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value))) throw new Error('INVALID_EVIDENCE_DIGEST');
  }
  if (kind === 'header') {
    assertCampaign({schema:'AEGIS_TESTNET_CAMPAIGN_V1',...Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='observer_id'))});
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(payload.observer_id)) throw new Error('INVALID_OBSERVER');
  }
  if (kind === 'heartbeat' && typeof payload.ok !== 'boolean') throw new Error('INVALID_HEARTBEAT');
  if (kind === 'replay' && (typeof payload.accepted !== 'boolean' || !['nominal','stress'].includes(payload.budget) || payload.http_status > 599)) throw new Error('INVALID_REPLAY_EVENT');
  if (kind === 'failure' && (!['observe','replay','send','finality','verification'].includes(payload.stage) || !['TRANSPORT','REJECTED','LOCKED_OR_BUSY','INVALID_EVIDENCE','FINALITY_TIMEOUT','PENDING_UNRESOLVED'].includes(payload.code))) throw new Error('INVALID_FAILURE_EVENT');
  if (payload.request_id && !/^[A-Za-z0-9_-]{1,128}$/.test(payload.request_id)) throw new Error('INVALID_REQUEST_ID');
}
export class EvidenceJournal {
  #fd; #filename; #previous='0'.repeat(64); #sequence=0;
  constructor({filename,campaign,observerId}) {
    assertCampaign(campaign); this.#filename=filename; this.#fd=openSync(filename,'wx',0o600);
    try { this.append('header',{campaign_id:campaign.campaign_id,config_id:campaign.config_id,environment:campaign.environment,image_ref:campaign.image_ref,start_anchor:campaign.start_anchor,target_origin:campaign.target_origin,observer_id:observerId}); }
    catch(error){closeSync(this.#fd);throw error;}
  }
  append(kind,payload) {
    assertEvent(kind,payload);
    const event={schema:'AEGIS_TESTNET_EVENT_V1',sequence:this.#sequence,previous:this.#previous,at:Date.now(),kind,payload};
    const digest=hash(event);writeSync(this.#fd,JSON.stringify({...event,hash:digest})+'\n');fsyncSync(this.#fd);
    this.#previous=digest;this.#sequence++;
    const temporary=`${this.#filename}.head-${crypto.randomUUID()}.tmp`;
    const fd=openSync(temporary,'wx',0o600);try{writeSync(fd,JSON.stringify({schema:'AEGIS_TESTNET_JOURNAL_HEAD_V1',events:this.#sequence,head_sha256:digest,last_at:event.at}));fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(temporary,`${this.#filename}.head.json`);return digest;
  }
  close(){if(this.#fd===undefined)return;fsyncSync(this.#fd);closeSync(this.#fd);this.#fd=undefined;return{events:this.#sequence,head_sha256:this.#previous};}
}
export async function* readJournal(filename) {
  let previous='0'.repeat(64),sequence=0,lastAt=0;
  const input=createReadStream(filename);const lines=createInterface({input,crlfDelay:Infinity});
  try { for await(const line of lines) {
    if(line.length>8192)throw new Error('EVIDENCE_LINE_TOO_LARGE');
    let row;try{row=JSON.parse(line);}catch{throw new Error('EVIDENCE_JOURNAL_INVALID');}
    const {hash:digest,...event}=row;
    if(Object.keys(row).sort().join(',')!=='at,hash,kind,payload,previous,schema,sequence'||event.schema!=='AEGIS_TESTNET_EVENT_V1'||event.sequence!==sequence||event.previous!==previous||hash(event)!==digest||
      !Number.isSafeInteger(event.at)||event.at<lastAt||(sequence===0)!==(event.kind==='header'))throw new Error('EVIDENCE_JOURNAL_INVALID');
    assertEvent(event.kind,event.payload);sequence++;previous=digest;lastAt=event.at;yield row;
  } if(sequence===0)throw new Error('EVIDENCE_JOURNAL_EMPTY'); }
  finally{lines.close();input.destroy();}
}
export async function verifyFinalizedBundle({bundle,config,backend=defaultStarkBackend()}) {
  const {transaction,proof,certificate,receipt}=bundle??{};
  const cp=certificate?.checkpoint;
  if(!cp || cp.schema!=='AEGIS_FINALITY_CHECKPOINT_V1' || !Number.isSafeInteger(cp.height) || cp.height<1 || !Number.isSafeInteger(cp.commitment_count) || cp.commitment_count<1 ||
    !['config_id','parent_checkpoint_id','transaction_id','transition_hash','previous_root','root','program_id','proof_digest'].every(key=>typeof cp[key]==='string'&&/^[0-9a-f]{64}$/.test(cp[key])) || Object.keys(cp).sort().join(',') !== 'commitment_count,config_id,height,network_id,parent_checkpoint_id,previous_root,program_id,proof_digest,root,schema,transaction_id,transition_hash' || !verifyTransferSignature(transaction)||!cp||!receipt||receipt.settled!==true||receipt.transaction_id!==transaction.tx_id||receipt.height!==cp.height||receipt.checkpoint_id!==certificate.checkpoint_id||
    cp.config_id!==settlementConfigId(config)||cp.network_id!==config.network_id||transaction.network_id!==config.network_id||cp.program_id!==config.program_id||cp.transaction_id!==transaction.tx_id||cp.previous_root!==transaction.anchor_state_root||
    !verifyFinalityCertificate({config,certificate,expectedCheckpoint:cp}))throw new Error('INVALID_FINALIZED_BUNDLE');
  const transition=buildTranscriptHash({domainTag:'STATE_TRANSITION_V1',payload:{network_id:config.network_id,transactionId:transaction.tx_id,requestId:transaction.request_id,expectedRoot:transaction.anchor_state_root,
    inputs:transaction.input_commitments,outputs:transaction.output_commitments,nullifiers:transaction.nullifiers}});
  const verified=await backend.verify({statement:statementForTransfer(transaction),proof});
  if(!verified.valid||verified.program_id!==config.program_id||verified.proof_digest!==cp.proof_digest||transition!==cp.transition_hash)throw new Error('FINALIZED_STARK_INVALID');
  return{request_id:transaction.request_id,tx_id:transaction.tx_id,checkpoint_id:certificate.checkpoint_id,height:cp.height,proof_digest:verified.proof_digest};
}
export function savePublicEvidence(filename,bundle){
  // Only explicit public fields; never serialize a wallet/session object.
  const bytes=JSON.stringify({transaction:bundle.transaction,proof:bundle.proof,certificate:bundle.certificate,receipt:{settled:bundle.receipt?.settled,transaction_id:bundle.receipt?.transaction_id,height:bundle.receipt?.height,checkpoint_id:bundle.receipt?.checkpoint_id}});
  if(Buffer.byteLength(bytes)>16*1024*1024)throw new Error('PUBLIC_EVIDENCE_TOO_LARGE');
  writeFileSync(filename,bytes,{flag:'wx',mode:0o600});return crypto.createHash('sha256').update(bytes).digest('hex');
}
export function loadPublicEvidence(filename){const bytes=readFileSync(filename);if(bytes.length>16*1024*1024)throw new Error('PUBLIC_EVIDENCE_TOO_LARGE');return{bundle:JSON.parse(bytes.toString('utf8')),sha256:crypto.createHash('sha256').update(bytes).digest('hex')};}
