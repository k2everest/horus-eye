import { dirname, join } from 'node:path';
import { canonicalSerialize, buildTranscriptHash } from '../../libs/crypto-core/canonical-transcript.mjs';
import { verifyDigest, signDigest, signerTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { settlementConfigId } from '../ledger-state/finality.mjs';
import { assertCampaign, readJournal, loadPublicEvidence, verifyFinalizedBundle } from './evidence.mjs';
export const REQUIREMENTS=Object.freeze({days:30,heartbeat_coverage:0.95,max_gap_hours:6,nominal_replays:10000,nominal_acceptance:0.999,fresh_finalized:1000,fresh_active_days:21,external_participants:10,flows_per_participant:10,p95_e2e_ms:1200000});
const FLOWS=['create','backup','restore','send','receive','sync','lock'];
const DRILLS=['gateway-kill','network-partition','disk-full','host-recovery-s3'];
const DRILL_RTO={'gateway-kill':120000,'network-partition':120000,'disk-full':120000,'host-recovery-s3':3600000};
const LATENCY_BUCKETS=[1,5,10,25,50,100,250,500,1000,5000,30000,60000,Infinity];
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
function assertReport(payload){
 if(!payload||!['participant','infrastructure_drill'].includes(payload.kind)||typeof payload.observer_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(payload.observer_id)||
  typeof payload.campaign_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(payload.campaign_id)||!hex(payload.config_id))throw new Error('INVALID_TESTNET_REPORT');
 if(payload.kind==='participant'){
  if(Object.keys(payload).sort().join(',')!=='campaign_id,config_id,flows,heads,kind,observer_id,transactions'||!Array.isArray(payload.transactions)||payload.transactions.length>10000||
   !payload.transactions.every(hex)||new Set(payload.transactions).size!==payload.transactions.length||!Array.isArray(payload.heads)||!payload.heads.length||payload.heads.length>10000||!payload.heads.every(hex)||
   !Array.isArray(payload.flows)||new Set(payload.flows).size!==payload.flows.length||payload.flows.some(f=>!FLOWS.includes(f)))throw new Error('INVALID_TESTNET_REPORT');
 }else if(Object.keys(payload).sort().join(',')!=='artifact_sha256,campaign_id,config_id,external_environment,kind,measured_recovery_ms,observer_id,recovered,scenario'||!DRILLS.includes(payload.scenario)||
  !hex(payload.artifact_sha256)||!Number.isSafeInteger(payload.measured_recovery_ms)||payload.measured_recovery_ms<0||typeof payload.external_environment!=='boolean'||typeof payload.recovered!=='boolean')throw new Error('INVALID_TESTNET_REPORT');
}
export function signTestnetReport(payload,privateKey){assertReport(payload);return{payload,signature:signDigest({algorithm:'ML-DSA-65',privateKey,messageDigest:buildTranscriptHash({domainTag:'AEGIS_TESTNET_REPORT_V1',payload}),domainTag:'AEGIS_TESTNET_REPORT_V1'}).signature};}
export function verifyEnrolledReport(envelope,campaign,registry){
 try{
  if(Object.keys(envelope).sort().join(',')!=='payload,signature')return undefined;
  const p=envelope.payload;assertReport(p);
  const entry=registry.find(r=>r.observer_id===p.observer_id);
  if(!entry||entry.independence_reviewed!==true||!hex(entry.review_reference_sha256)||p.campaign_id!==campaign.campaign_id||p.config_id!==campaign.config_id||
    entry.role!==(p.kind==='participant'?'participant':'operator')||typeof entry.public_key!=='string'||entry.public_key.length>8192)return undefined;
  if(!verifyDigest({algorithm:'ML-DSA-65',publicKey:entry.public_key,messageDigest:buildTranscriptHash({domainTag:'AEGIS_TESTNET_REPORT_V1',payload:p}),signature:envelope.signature,domainTag:'AEGIS_TESTNET_REPORT_V1'}).valid)return undefined;
  return p;
 }catch{return undefined;}
}
export async function assessCampaign({campaign,config,journalPaths,registry=[],reports=[],backend}){
 assertCampaign(campaign);
 if(campaign.config_id!==settlementConfigId(config)||!Array.isArray(journalPaths)||!journalPaths.length||journalPaths.length>4096||!Array.isArray(registry)||registry.length>128||new Set(registry.map(r=>r.observer_id)).size!==registry.length||!Array.isArray(reports)||reports.length>10000)throw new Error('INVALID_CAMPAIGN_ASSESSMENT');
 if(new Set(registry.map(r=>signerTag(r.public_key,'ML-DSA-65'))).size!==registry.length)throw new Error('DUPLICATE_ENROLLMENT_KEY');
 const submitted=new Map(),finalized=new Map(),freshDays=new Set(),heartbeatBins=new Set(),heartbeatSlots=new Map(),corpus=new Set(),heads=new Map(),journalHeads=new Set();const latencies=[],replayHistogram=LATENCY_BUCKETS.map(()=>0);
 let first=Infinity,last=0,heartbeats=0,healthy=0,nominal=0,accepted=0,stress=0,duplicates=0,failures=0,totalEvents=0;
 for(const filename of journalPaths){let header,lastRow;
  for await(const row of readJournal(filename)){
   lastRow=row;
   if(++totalEvents>10000000)throw new Error('CAMPAIGN_EVIDENCE_LIMIT');
   if(row.kind==='header'){
    header=row.payload;const{observer_id,...claim}=header;void observer_id;
    if(canonicalSerialize({...claim,schema:'AEGIS_TESTNET_CAMPAIGN_V1'})!==canonicalSerialize(campaign))throw new Error('CAMPAIGN_HEADER_MISMATCH');
   }
   const p=row.payload;
   if(row.kind==='heartbeat'){heartbeats++;if(p.ok)healthy++;first=Math.min(first,row.at);last=Math.max(last,row.at);heartbeatBins.add(Math.floor(row.at/900000));const slot=Math.floor(row.at/30000);heartbeatSlots.set(slot,(heartbeatSlots.get(slot)??true)&&p.ok);}
   if(row.kind==='replay'){corpus.add(p.proof_digest);if(p.budget==='nominal'){nominal++;if(p.accepted){accepted++;replayHistogram[LATENCY_BUCKETS.findIndex(limit=>p.latency_ms<=limit)]++;}}else stress++;}
   if(row.kind==='failure')failures++;
   if(row.kind==='submitted'){
    if(!submitted.has(p.tx_id))submitted.set(p.tx_id,p);
   }
   if(row.kind==='finalized'){
    const submission=submitted.get(p.tx_id);
    if(!submission||submission.request_id!==p.request_id||p.height<=submission.start_height||p.height<=campaign.start_anchor.height)throw new Error('FRESH_EVENT_HAS_NO_MATCHING_SUBMISSION');
    const artifact=loadPublicEvidence(join(dirname(filename),`${p.tx_id}.json`));
    if(artifact.sha256!==p.artifact_sha256)throw new Error('FRESH_ARTIFACT_HASH_MISMATCH');
    if(p.height===campaign.start_anchor.height+1&&artifact.bundle.certificate?.checkpoint?.parent_checkpoint_id!==campaign.start_anchor.checkpoint_id)throw new Error('CAMPAIGN_START_ANCHOR_CONFLICT');
    const verified=await verifyFinalizedBundle({bundle:artifact.bundle,config,backend});
    for(const key of ['request_id','tx_id','checkpoint_id','height','proof_digest'])if(verified[key]!==p[key])throw new Error('FRESH_EVENT_EVIDENCE_MISMATCH');
    if(finalized.has(p.tx_id)){duplicates++;continue;}
    if(finalized.size>=100000)throw new Error('CAMPAIGN_TRANSACTION_LIMIT');
    freshDays.add(Math.floor(row.at/86400000));finalized.set(p.tx_id,{...p,sender_tag:artifact.bundle.transaction.sender_tag});latencies.push(p.elapsed_ms);
   }
  }
  // Only the terminal hash is an eligible report anchor.
  if(journalHeads.has(lastRow.hash))throw new Error('DUPLICATE_JOURNAL_SOURCE');journalHeads.add(lastRow.hash);
  if(!heads.has(header.observer_id))heads.set(header.observer_id,new Set());heads.get(header.observer_id).add(lastRow.hash);
 }
 latencies.sort((a,b)=>a-b);
 const duration=first===Infinity?0:last-first;const bins=[...heartbeatBins].sort((a,b)=>a-b);
 const coverage=bins.length?bins.length/(bins.at(-1)-bins[0]+1):0;
 let gap=0;for(let i=1;i<bins.length;i++)gap=Math.max(gap,(bins[i]-bins[i-1])*900000);
 const expectedSlots=heartbeats?Math.floor(last/30000)-Math.floor(first/30000)+1:0;
 const adjustedLiveness=expectedSlots?[...heartbeatSlots.values()].filter(Boolean).length/expectedSlots:0;
 const participants=new Set(),drills=new Set();let invalidReports=0;
 for(const envelope of reports){const report=verifyEnrolledReport(envelope,campaign,registry);if(!report){invalidReports++;continue;}
  if(report.kind==='participant'){
   if(FLOWS.every(flow=>report.flows.includes(flow))&&report.heads.some(h=>heads.get(report.observer_id)?.has(h))&&report.transactions.filter(tx=>finalized.has(tx)&&finalized.get(tx).sender_tag===registry.find(r=>r.observer_id===report.observer_id).wallet_signer_tag).length>=REQUIREMENTS.flows_per_participant)participants.add(report.observer_id);
  }else if(campaign.environment==='public-testnet'&&report.external_environment&&report.recovered&&report.measured_recovery_ms<=DRILL_RTO[report.scenario])drills.add(report.scenario);
 }
 const replayPercentile=fraction=>{if(!accepted)return null;let total=0;for(let i=0;i<replayHistogram.length;i++){total+=replayHistogram[i];if(total>=Math.ceil(accepted*fraction))return Number.isFinite(LATENCY_BUCKETS[i])?LATENCY_BUCKETS[i]:null;}return null;};
 const p95=latencies.length?latencies[Math.max(0,Math.ceil(latencies.length*0.95)-1)]:null;
 const checks={public_environment:campaign.environment==='public-testnet',duration:duration>=REQUIREMENTS.days*86400000,
  liveness_availability:heartbeats>0&&adjustedLiveness>=REQUIREMENTS.nominal_acceptance,heartbeat_coverage:coverage>=REQUIREMENTS.heartbeat_coverage,max_observation_gap:heartbeats>1&&gap<=REQUIREMENTS.max_gap_hours*3600000,
  nominal_replay_volume:nominal>=REQUIREMENTS.nominal_replays,nominal_replay_acceptance:nominal>0&&accepted/nominal>=REQUIREMENTS.nominal_acceptance,
  unique_fresh_finalizations:finalized.size>=REQUIREMENTS.fresh_finalized,fresh_activity_spread:freshDays.size>=REQUIREMENTS.fresh_active_days,p95_e2e:p95!==null&&p95<=REQUIREMENTS.p95_e2e_ms,
  all_submissions_finalized:submitted.size===finalized.size&&submitted.size>0,independent_enrolled_reports:participants.size>=REQUIREMENTS.external_participants,infrastructure_drills:DRILLS.every(d=>drills.has(d))};
 return{schema:'AEGIS_TESTNET_ASSESSMENT_V1',campaign_id:campaign.campaign_id,requirements:REQUIREMENTS,checks,
  measurements:{observed_ms:duration,heartbeat_samples:heartbeats,liveness_success_ratio:heartbeats?healthy/heartbeats:null,missing_samples_count_as_failures_ratio:adjustedLiveness,heartbeat_coverage:coverage,max_gap_ms:gap,
   nominal_replays:nominal,nominal_accepted:accepted,nominal_latency_upper_bound_ms:{p50:replayPercentile(0.5),p95:replayPercentile(0.95),p99:replayPercentile(0.99)},stress_replays:stress,distinct_replay_proofs:corpus.size,fresh_submitted:submitted.size,fresh_finalized:finalized.size,fresh_active_days:freshDays.size,
   duplicate_finalizations_ignored:duplicates,p95_e2e_ms:p95,enrolled_external_reporters:participants.size,signed_external_drills:[...drills],invalid_reports:invalidReports,failures},
  automated_checks_met:Object.values(checks).every(Boolean),independent_review_required:true,p1_completed:false,production_ready:false,
  note:'Local journals and signed statements require independent review of public reachability, enrollment, infrastructure failures, clocks and declared deployment. They do not independently prove these facts.'};
}
