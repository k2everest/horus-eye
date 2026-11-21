// Candidate-only Composite verifier contract with FULL-WIDTH SHA-512 outer
// hashes. No actual alternative STARK SDK is installed here. Every successful
// result is RESEARCH-ONLY; acceptance by a mocked adapter is NOT a proof.
// RISC Zero's existing SHA-256/Poseidon2 receipts MUST NOT be passed as V4.
import {assertFinancialStatement512,financialStatementDigest512} from '../financial/relation.mjs';
import {ascii,bytes512,digestV4,uint32BE,segmentClaimDigestV4,journalDigestV4} from './hash512.mjs';

const exactly=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export const V4_CANDIDATE='AEGIS_V4_TRANSPARENT_STARK_CANDIDATE_ONLY';
const RESEARCH={aegis_target_met:false,production_ready:false,cryptographic_soundness_demonstrated:false};
const bad=reason=>({structurally_consistent:false,reason,...RESEARCH});
function canonicalProof(proof){
  if(typeof proof!=='string'||proof.length<4||proof.length>1_398_104||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(proof))
    throw new TypeError('canonical bounded base64 required');
  const bytes=Buffer.from(proof,'base64');
  if(bytes.length===0||bytes.length>1024*1024||bytes.toString('base64')!==proof)
    throw new TypeError('invalid proof encoding');
  return bytes;
}
const require64=v=>{bytes512(v);return v;};

// A verifier must independently return the authenticated claim extracted from
// proof verification. It MUST NOT echo unverified proof-supplied claims. This
// contract is an interface awaiting a separate SDK implementation and audit.
export async function reviewCompositeV4({statement,expected,segments,backend}={}){
  try{
    assertFinancialStatement512(statement);
    if(!exactly(expected,['network_id','program_id','initial_state','statement_digest','segment_count'])||
      expected.network_id!==statement.network_id||!Array.isArray(segments)||segments.length<1||
      segments.length>64||expected.segment_count!==segments.length ||
      !Number.isSafeInteger(expected.segment_count)||expected.segment_count<1||expected.segment_count>64)
      return bad('INVALID_PUBLIC_SCOPE');
    const program=require64(expected.program_id),initial=require64(expected.initial_state);
    const statementDigest=financialStatementDigest512(statement);
    if(require64(expected.statement_digest)!==statementDigest)return bad('UNTRUSTED_STATEMENT');
    if(!backend||backend.kind!=='external-verified-512-bit-segment-claims'||
      typeof backend.verifySegment!=='function')
      return bad('NO_INDEPENDENT_SEGMENT_VERIFIER');
    const journal=journalDigestV4(statement),segmentDigests=[];
    let state=initial;
    for(let index=0;index<segments.length;index++){
      const step=segments[index];
      if(!exactly(step,['proof']))return bad('NONCANONICAL_PROOF_SCHEMA');
      const proofBytes=canonicalProof(step.proof);
      // The backend receives an externally fixed program ID and statement.
      // Its authenticated result must be derived from verifying proofBytes.
      const checked=await backend.verifySegment({
        proofBytes,programId:program,networkId:expected.network_id,
        statementDigest,segmentIndex:index,segmentCount:segments.length});
      const claim=checked?.authenticated;
      if(checked?.valid!==true||
        !exactly(claim,['network_id','program_id','index','segment_count','pre_state','post_state','journal_digest'])||
        claim.network_id!==expected.network_id||claim.program_id!==program||
        claim.index!==index||claim.segment_count!==segments.length||
        require64(claim.pre_state)!==state)return bad('INVALID_AUTHENTICATED_SEGMENT');
      const final=index===segments.length-1;
      if(final?require64(claim.journal_digest)!==journal:claim.journal_digest!==null)
        return bad('JOURNAL_NOT_BOUND');
      state=require64(claim.post_state);
      const proofCommitment=digestV4('AEGIS_V4_SEGMENT_PROOF',[proofBytes]);
      segmentDigests.push(segmentClaimDigestV4({
        network_id:expected.network_id,program_id:program,index,segment_count:segments.length,
        pre_state:claim.pre_state,post_state:claim.post_state,proof_commitment:proofCommitment}));
    }
    const root=digestV4('AEGIS_V4_COMPOSITE_ROOT',[
      ascii(expected.network_id),bytes512(program),bytes512(statementDigest),
      bytes512(initial),bytes512(state),bytes512(journal),uint32BE(segments.length),
      ...segmentDigests.map(bytes512)]);
    return {structurally_consistent:true,scope:'external-segment-verifier-interface-only',
      composite_root:root,final_state:state,journal_digest:journal,
      statement_digest:statementDigest,segments_verified_by_adapter:segments.length,...RESEARCH};
  }catch{return bad('INVALID_CANDIDATE_COMPOSITE');}
}
