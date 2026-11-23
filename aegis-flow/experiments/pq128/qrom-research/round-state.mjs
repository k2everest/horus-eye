// Theorem 8.6 research scaffold: typed transcript boundaries of
// Plonky3 v0.8.0 (Aegis WiredAir + LogUp + HidingFriPcs).
// Prefix structure is NOT the CMS state function or a proof of knowledge.
const SOURCE=Object.freeze({
  upstream:'Plonky3/Plonky3@v0.8.0',
  batch:'batch-stark/src/transcript.rs@707ec95b2f631f389ab403c50ca795b4013ef821',
  pcs:'fri/src/pcs_transcript.rs@b9c3764a67c70cfac054fca58fe4fdf6630d0cac',
  fri:'fri/src/transcript.rs@739224657bc48b5337225ed63baf7d5fc7c15df1',
});
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const fixed=(id,role,stage,source,info='')=>Object.freeze({id,role,stage,source,info});
const freeze=x=>Object.freeze(x);

/** Transcript message/challenge boundaries, not a bit-level replay.
 * FRI schedule MUST be derived by the verifier from its PCS shape,
 * not supplied authoritatively by a malicious prover.
 */
export function wiredRoundSchedule({
  friLogArities,batchInstances=1,lookupInstances=1,
  lookupPowBits=0,oodPowBits=0,pcsBatchPowBits=0,
  friCommitPowBits=0,friQueryPowBits=0,
  friQueries=320,hasPreprocessed=true,hiding=true,
}={}){
  if(!Array.isArray(friLogArities)||friLogArities.length<1||
     friLogArities.length>32||!friLogArities.every(n=>integer(n,1,8))||
     !integer(batchInstances,1,64)||!integer(lookupInstances,1,batchInstances)||
     !integer(friQueries,1,100000)||
     ![lookupPowBits,oodPowBits,pcsBatchPowBits,friCommitPowBits,
       friQueryPowBits].every(n=>integer(n,0,256))||
     hasPreprocessed!==true||hiding!==true)
    throw new TypeError('UNSUPPORTED_OR_UNVERIFIED_WIRED_SHAPE');
  const steps=[];
  const add=(id,role,stage,source,info)=>steps.push(fixed(id,role,stage,source,info));
  for(let i=0;i<batchInstances;i++)add('degree_bits_'+i,'prover','batch','batch','verifier checks degrees');
  add('main_commitment','prover','batch','batch');
  for(let i=0;i<batchInstances;i++)add('public_values_'+i,'public','batch','batch');
  add('preprocessed_commitment','public','batch','batch','verifier-reconstructed public commitment');
  add('lookup_pow','prover','lookup','batch','difficulty '+lookupPowBits+' (zero-PoW pinned)');
  add('lookup_alpha','verifier','lookup','batch');
  add('lookup_beta','verifier','lookup','batch');
  add('permutation_commitment','prover','lookup','batch');
  for(let i=0;i<lookupInstances;i++)add('lookup_terminal_'+i,'prover','lookup','batch');
  add('constraint_challenge','verifier','ali','batch');
  add('quotient_commitment','prover','ali','batch');
  add('randomization_commitment','prover','hiding','batch');
  add('ood_pow','prover','deep','batch','difficulty '+oodPowBits+' (canonical witness)');
  add('zeta','verifier','deep','batch');
  add('pcs_claimed_evaluations','prover','pcs','pcs','all claimed openings');
  if(pcsBatchPowBits>0)add('pcs_batch_pow','prover','pcs','pcs');
  add('pcs_batch_alpha','verifier','pcs','pcs');
  for(let i=0;i<friLogArities.length;i++){
    add('fri_commitment_'+i,'prover','fri','fri','arity 2^'+friLogArities[i]);
    if(friCommitPowBits>0)add('fri_commit_pow_'+i,'prover','fri','fri');
    add('fri_fold_challenge_'+i,'verifier','fri','fri');
  }
  add('fri_final_poly','prover','fri','fri');
  if(friQueryPowBits>0)add('fri_query_pow','prover','fri','fri');
  add('fri_query_indices','verifier','fri','fri',friQueries+' sampled indices');
  add('fri_openings','prover','opening','fri','Merkle query openings; not absorbed as further challenges');
  add('terminal_verification','check','terminal','fri','verify_batch, FRI, Merkle and AIR');
  return freeze({
    schema:'AEGIS_WIRED_FULL_TRANSCRIPT_SCHEDULE_RESEARCH_V1',
    sources:SOURCE,
    parameters:freeze({batchInstances,lookupInstances,lookupPowBits,oodPowBits,
      pcsBatchPowBits,friCommitPowBits,friQueryPowBits,friQueries,
      friLogArities:freeze([...friLogArities]),hasPreprocessed,hiding}),
    steps:freeze(steps),
    verifier_challenges:freeze(steps.filter(x=>x.role==='verifier').map(x=>x.id)),
    fri_schedule_proven_from_verifier:false,
    byte_level_fiat_shamir_equivalence_proven:false,
    round_by_round_knowledge_proved:false,pq128_demonstrated:false,production_ready:false,
  });
}
function checkShape(schedule){
  if(schedule?.schema!=='AEGIS_WIRED_FULL_TRANSCRIPT_SCHEDULE_RESEARCH_V1'||
     !Array.isArray(schedule.steps)||schedule.steps.length<1)
    throw new TypeError('UNTRUSTED_SCHEDULE');
}
export function validateWiredTranscriptPrefix(schedule,eventIds){
  checkShape(schedule);
  if(!Array.isArray(eventIds)||eventIds.length>schedule.steps.length)
    throw new TypeError('INVALID_PREFIX');
  for(let i=0;i<eventIds.length;i++)
    if(eventIds[i]!==schedule.steps[i].id)throw new Error('NONCANONICAL_TRANSCRIPT_ORDER');
  const next=schedule.steps[eventIds.length]??null;
  return freeze({
    schema:'AEGIS_WIRED_TRANSCRIPT_PREFIX_AUDIT_V1',
    completed_events:eventIds.length,
    next_id:next?.id??null,
    next_role:next?.role??null,
    verifier_challenge_count:eventIds.reduce((n,id)=>n+Number(
      schedule.steps.find(x=>x.id===id)?.role==='verifier'),0),
    structurally_complete:next===null,
    // Unknown is deliberate: chronology never implies IOP knowledge.
    cms_state_bit:null,
    cms_state_function_proved:false,
    deterministic_prover_monotonicity_proved:false,
    terminal_rejection_axiom_proved:false,
    knowledge_extractor_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}

/** Tests CMS Def 8.3 syntactic axioms on a SINGLE finite toy trace.
 * It cannot quantify over all prover messages, random challenges or traces.
 */
export function checkCandidateStateTrace(schedule,eventIds,stateBits,{
  accepted=false}={}){
  const prefix=validateWiredTranscriptPrefix(schedule,eventIds);
  if(!Array.isArray(stateBits)||stateBits.length!==eventIds.length+1||
     !stateBits.every(x=>x===0||x===1))
    throw new TypeError('INVALID_TOY_STATE_BITS');
  const empty=stateBits[0]===0;
  let monotonic=true,proverNoRevival=true;
  for(let i=0;i<eventIds.length;i++){
    const role=schedule.steps[i].role;
    if(stateBits[i]===1&&stateBits[i+1]!==1)monotonic=false;
    if(role!=='verifier'&&stateBits[i]===0&&stateBits[i+1]!==0)
      proverNoRevival=false;
  }
  const terminalRejection=!(prefix.structurally_complete&&accepted&&stateBits.at(-1)===0);
  return freeze({
    schema:'AEGIS_TOY_CMS_STATE_AXIOM_TRACE_V1',
    empty_axiom:empty,prover_move_axiom:proverNoRevival,
    monotone_optional_policy:monotonic,terminal_axiom_on_supplied_trace:terminalRejection,
    local_trace_axioms_pass:empty&&proverNoRevival&&terminalRejection,
    universal_quantification_proved:false,challenge_probability_bound_proved:false,
    financial_extraction_proved:false,theorem_8_6_applicable:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
if(process.argv[1]?.endsWith('/round-state.mjs')){
  const s=wiredRoundSchedule({friLogArities:Array(12).fill(1)});
  process.stdout.write(JSON.stringify({
    schema:s.schema,upstream:s.sources,steps:s.steps,total_steps:s.steps.length,
    illustrative_schedule_only:true,theorem_8_6_applicable:false,pq128_demonstrated:false,
  },null,2)+'\n');
}