import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {canonicalSerialize,buildTranscriptHash} from '../../libs/crypto-core/canonical-transcript.mjs';
import {signDigest,verifyDigest,signerTag} from '../../libs/crypto-core/pqc-wrapper.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const APPROVAL_ROLES=Object.freeze(['product','protocol','operations','security','legal']);
export const OPERATING_ROLES=Object.freeze(['product','protocol','operations','authority','security','backup_recovery','legal','privacy','support']);
export const CURRENT_MONETARY_FACTS=Object.freeze({
 unit_model:'integer-atomic-units',max_note_value:'9007199254740991',inputs_max:4,outputs_max:4,
 per_transition_assets:1,merkle_leaf_count_max:1000000,global_asset_allowlist:false,explicit_max_supply_registry:false,supply_model:'network-specific-legacy-genesis-or-open-pow-subsidy',
 conservation:'sum(inputs)=sum(outputs)+public_amount',public_amount_max:'9007199254740991',
 public_amount_payout_implemented:false,public_mint_endpoint:false,genesis_value_total_proof:false,
 settlement:'legacy-permissioned-and-experimental-open-pow',monetary_value_authorized:false,
 open_pow:{protocol:'AEGIS_OPEN_POW_V2',transaction_network_binding:'full-genesis-config-id',genesis:'empty',asset:'fixed-by-genesis',supply_cap:'fixed-by-genesis-u64',subsidy:'deterministic-capped-per-block',
  monetary_authority:false,participant_country_filter:false,validator_allowlist:false,public_amount_required:0,finality:'probabilistic',wallet_integrated:false},
});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export const factsBaseline=JSON.parse(readFileSync(new URL('./facts-baseline.json',import.meta.url),'utf8'));
function assertDossier(dossier){
 if(!exact(dossier,['schema','review_id','scope','candidate','operator','monetary_decisions','operating_roles','documents','evidence'])||dossier.schema!=='AEGIS_LAUNCH_REVIEW_V1'||
  typeof dossier.review_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(dossier.review_id)||!['lab-testnet','economic-launch'].includes(dossier.scope)||
  !exact(dossier.candidate,['source_commit','image_ref','config_id','genesis_root'])||!exact(dossier.operator,['entity_reference_sha256','jurisdictions','legal_assessment_sha256'])||
  !Array.isArray(dossier.operator.jurisdictions)||dossier.operator.jurisdictions.length>249||new Set(dossier.operator.jurisdictions).size!==dossier.operator.jurisdictions.length||
  dossier.operator.jurisdictions.some(j=>typeof j!=='string'||!/^[A-Z]{2}$/.test(j)||['XX','ZZ'].includes(j))||
  !exact(dossier.operating_roles,OPERATING_ROLES)||!exact(dossier.monetary_decisions,['asset_unit_policy_sha256','genesis_allocation_review_sha256','supply_issuance_policy_sha256','public_amount_policy_sha256','governance_policy_sha256'])||
  !exact(dossier.evidence,['independent_crypto_audit_sha256','pq_parameter_review_sha256','key_lifecycle_review_sha256','external_restore_drill_sha256','public_testnet_acceptance_sha256','communications_review_sha256'])||
  !Array.isArray(dossier.documents)||dossier.documents.length!==3)throw new Error('INVALID_LAUNCH_DOSSIER');
 for(const role of OPERATING_ROLES){const owner=dossier.operating_roles[role];if(!exact(owner,['responsible_id','deputy_id','appointment_sha256','coverage_sha256']))throw new Error('INVALID_OPERATING_ROLE');}
 const seen=new Set();
 for(const doc of dossier.documents){if(!exact(doc,['id','file','sha256'])||!['monetary-rules','operating-responsibilities','legal-review'].includes(doc.id)||seen.has(doc.id)||doc.file!==`docs/launch/${doc.id}.md`||!hex(doc.sha256))throw new Error('INVALID_REVIEW_DOCUMENT');seen.add(doc.id);}
}
export function dossierDigest(dossier){assertDossier(dossier);return buildTranscriptHash({domainTag:'AEGIS_LAUNCH_DOSSIER_V1',payload:dossier});}
function approvalPayload(envelope){const{signature,...payload}=envelope;void signature;return payload;}
export function signLaunchDecision({dossier,signerId,role,decision='approve',signedAt=Date.now(),expiresAt,privateKey}){
 const payload={schema:'AEGIS_LAUNCH_APPROVAL_V1',review_digest:dossierDigest(dossier),signer_id:signerId,role,decision,signed_at:signedAt,expires_at:expiresAt};
 assertApproval({...payload,signature:'pending'});
 return{...payload,signature:signDigest({algorithm:'ML-DSA-65',privateKey,messageDigest:buildTranscriptHash({domainTag:'AEGIS_LAUNCH_APPROVAL_V1',payload}),domainTag:'AEGIS_LAUNCH_APPROVAL_V1'}).signature};
}
function assertApproval(approval){
 if(!exact(approval,['schema','review_digest','signer_id','role','decision','signed_at','expires_at','signature'])||approval.schema!=='AEGIS_LAUNCH_APPROVAL_V1'||!hex(approval.review_digest)||
  typeof approval.signer_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(approval.signer_id)||!APPROVAL_ROLES.includes(approval.role)||!['approve','reject'].includes(approval.decision)||
  !Number.isSafeInteger(approval.signed_at)||approval.signed_at<0||!Number.isSafeInteger(approval.expires_at)||approval.expires_at<=approval.signed_at||approval.expires_at-approval.signed_at>30*86400000||typeof approval.signature!=='string'||approval.signature.length>10000)throw new Error('INVALID_LAUNCH_APPROVAL');
}
export function reviewLaunch({dossier,registry=[],approvals=[],now=Date.now(),root=ROOT,baseline=factsBaseline}){
 assertDossier(dossier);const digest=dossierDigest(dossier);
 if(!Array.isArray(registry)||registry.length>64||!Array.isArray(approvals)||approvals.length>128)throw new Error('INVALID_LAUNCH_REVIEW_INPUT');
 const identities=new Set(),keys=new Set();
 for(const signer of registry){
  if(!exact(signer,['signer_id','role','public_key','mandate_sha256','qualification_review_sha256'])||typeof signer.signer_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(signer.signer_id)||!APPROVAL_ROLES.includes(signer.role)||
   !hex(signer.mandate_sha256)||!hex(signer.qualification_review_sha256)||typeof signer.public_key!=='string'||signer.public_key.length>8192||identities.has(signer.signer_id))throw new Error('INVALID_APPROVER_REGISTRY');
  const key=signerTag(signer.public_key,'ML-DSA-65');if(keys.has(key))throw new Error('APPROVER_KEYS_MUST_BE_DISTINCT');keys.add(key);identities.add(signer.signer_id);
 }
 const blockers=[];const checks={};
 const commit=dossier.candidate.source_commit;
 const candidateBound=typeof commit==='string'&&/^[0-9a-f]{40}$/.test(commit);
 let sourcesMatch=baseline.schema==='AEGIS_MONETARY_FACTS_V1'&&canonicalSerialize(baseline.facts)===canonicalSerialize(CURRENT_MONETARY_FACTS);
 const mismatches=[];
 for(const[name,expected]of Object.entries(factsBaseline.source_sha256)){
  try{
   // Read exact runtime files from the candidate Git object. The dossier itself
   // may live outside that commit, avoiding a self-referential commit hash.
   const bytes=candidateBound?execFileSync('git',['show',`${commit}:${name}`],{cwd:root,maxBuffer:2*1024*1024,stdio:['ignore','pipe','ignore']}):readFileSync(join(root,name));
   if(hash(bytes)!==expected)mismatches.push(name);
  }catch{mismatches.push(name);}
 }
 if(canonicalSerialize(baseline.source_sha256)!==canonicalSerialize(factsBaseline.source_sha256))sourcesMatch=false;
 checks.monetary_source_baseline=sourcesMatch&&mismatches.length===0;
 checks.candidate_bound=candidateBound&&typeof dossier.candidate.image_ref==='string'&&/^(?:sha256:[0-9a-f]{64}|[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64})$/.test(dossier.candidate.image_ref)&&hex(dossier.candidate.config_id)&&hex(dossier.candidate.genesis_root);
 checks.entity_and_jurisdictions=hex(dossier.operator.entity_reference_sha256)&&dossier.operator.jurisdictions.length>0&&hex(dossier.operator.legal_assessment_sha256);
 checks.monetary_decisions=Object.values(dossier.monetary_decisions).every(hex);
 const unassigned=[];
 for(const[role,owner]of Object.entries(dossier.operating_roles)){
  const validId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(v);
  if(!validId(owner.responsible_id)||!validId(owner.deputy_id)||owner.responsible_id===owner.deputy_id||!hex(owner.appointment_sha256)||!hex(owner.coverage_sha256))unassigned.push(role);
 }
 checks.operating_roles_assigned=unassigned.length===0;
 const documentMismatches=[];
 for(const doc of dossier.documents){try{if(hash(readFileSync(join(root,'aegis-flow',doc.file)))!==doc.sha256)documentMismatches.push(doc.id);}catch{documentMismatches.push(doc.id);}}
 checks.documents_bound=documentMismatches.length===0;
 checks.evidence_references=Object.values(dossier.evidence).every(hex);
 const approved=new Set(),rejected=new Set(),seen=new Set();let invalidApprovals=0;
 for(const approval of approvals){
  try{
   assertApproval(approval);const signer=registry.find(s=>s.signer_id===approval.signer_id&&s.role===approval.role);
   if(!signer||seen.has(approval.signer_id)||approval.review_digest!==digest||approval.signed_at>now||approval.expires_at<=now||
    !verifyDigest({algorithm:'ML-DSA-65',publicKey:signer.public_key,messageDigest:buildTranscriptHash({domainTag:'AEGIS_LAUNCH_APPROVAL_V1',payload:approvalPayload(approval)}),signature:approval.signature,domainTag:'AEGIS_LAUNCH_APPROVAL_V1'}).valid){invalidApprovals++;continue;}
   seen.add(approval.signer_id);(approval.decision==='approve'?approved:rejected).add(approval.role);
  }catch{invalidApprovals++;}
 }
 checks.role_approvals=APPROVAL_ROLES.every(role=>approved.has(role))&&rejected.size===0&&invalidApprovals===0;
 for(const[key,value]of Object.entries(checks))if(!value)blockers.push(key);
 // Referenced hashes/signatures are document controls, not validation of the
 // external opinion, professional mandate, audit, deployment or economic rights.
 const knownTechnicalBlockers=['128-bit post-quantum STARK security not demonstrated','Independent cryptographic audit not validated by this review','Public prolonged testnet and external restoration evidence not validated by this review'];
 return{schema:'AEGIS_LAUNCH_REVIEW_RESULT_V1',review_id:dossier.review_id,review_digest:digest,scope:dossier.scope,checks,
  monetary_facts:CURRENT_MONETARY_FACTS,source_mismatches:mismatches,document_mismatches:documentMismatches,unassigned_roles:unassigned,
  approved_roles:[...approved],rejected_roles:[...rejected],invalid_approvals:invalidApprovals,
  dossier_controls_complete:Object.values(checks).every(Boolean),unmet_dossier_controls:blockers,known_technical_blockers:knownTechnicalBlockers,
  external_evidence_validation_required:true,legal_clearance_asserted:false,release_authorized:false,production_ready:false};
}
