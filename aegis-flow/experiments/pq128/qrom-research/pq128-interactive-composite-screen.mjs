// Arithmetic-equivalent UDR term screen for the pinned p3-security 0.8.0
// WiredAir/LogUp/FRI recipe. Shape fields require an INDEPENDENT verifier
// report; no user-supplied report counts as binary/source attestation.
// The source equations are in p3-security::{air,deep,logup,fri,stark,assumption}.
// No relation between this number and complete quantum knowledge soundness
// is implied. A hardware/software release gate MUST remain closed.
const BABYBEAR=2013265921;
const LOG_TRACE=13; // 4096 trace rows doubled by HidingFriPcs
const LOG_BLOWUP=3,MAX_COMBO=2;
const GRINDING_BITS=0;
const NUM_LOOKUP_INTERACTIONS=4,LOOKUP_WIDTH=2;
const QUANTUM_LOG_QUERY_BUDGET=64,TARGET=128,RESERVE=80;
const finiteInteger=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const minEntry=(entries)=>entries.reduce((a,b)=>a.bits<=b.bits?a:b);
export function estimateWiredInteractiveUDR({
  extensionDegree,queries,numConstraints,maxConstraintDegree,
  quotientChunks,numBatchedFunctions,
  hashCollisionAssumptionBits=170,
  nativeVerifierReportAttested=false,
}={}){
  if(!finiteInteger(extensionDegree,1,32)||
    !finiteInteger(queries,1,2048)||
    !finiteInteger(numConstraints,1,1_000_000)||
    !finiteInteger(maxConstraintDegree,1,256)||
    !finiteInteger(quotientChunks,1,1<<20)||
    (quotientChunks & (quotientChunks-1))!==0||
    !finiteInteger(numBatchedFunctions,1,1_000_000)||
    !finiteInteger(hashCollisionAssumptionBits,0,512)||
    typeof nativeVerifierReportAttested!=='boolean')
      throw new TypeError('UNSUPPORTED_WIRED_RBR_SHAPE');
  const modulusBits=Math.floor(extensionDegree*Math.log2(BABYBEAR));
  const k=2**LOG_TRACE,n=k*2**LOG_BLOWUP;
  const alpha=(1+(k+MAX_COMBO)/n)/2;
  const deepEth=maxConstraintDegree*(k+MAX_COMBO-1)+(k-1);
  const deepNative=(quotientChunks+1)*k+MAX_COMBO-1;
  const deepFactor=Math.max(deepEth,deepNative);
  // Exact p3-security 0.8.0 UDR formulas, without any grinding.
  const terms=[
    {label:'ali-composition',bits:modulusBits-Math.log2(numConstraints)},
    {label:'deep-ood',bits:modulusBits-Math.log2(deepFactor)},
    {label:'fri-query',bits:queries*(-Math.log2(alpha))},
    {label:'fri-commit',bits:modulusBits-Math.log2(n+1)},
    {label:'logup-fingerprint',bits:modulusBits-
      (LOG_TRACE+Math.log2(NUM_LOOKUP_INTERACTIONS))-
      Math.log2(LOOKUP_WIDTH+2)},
    {label:'hash-collision-external-assumption',
      bits:hashCollisionAssumptionBits},
  ];
  if(numBatchedFunctions>1){
    terms.push({label:'pcs-batching-udr',
      bits:modulusBits-(LOG_TRACE+LOG_BLOWUP)-
      Math.log2(numBatchedFunctions-1)});
  }
  const screened=terms.map(e=>Object.freeze({...e,bits:Math.max(0,e.bits)}));
  const binding=minEntry(screened);
  const rbrTarget=TARGET+2*QUANTUM_LOG_QUERY_BUDGET+RESERVE;
  const algebraicTerms=screened.filter(x=>x.label!=='hash-collision-external-assumption');
  const algebraicBinding=minEntry(algebraicTerms);
  return Object.freeze({
    schema:'AEGIS_WIRED_INTERACTIVE_UDR_TERM_SCREEN_V1',
    p3_security_version:'0.8.0',
    uses_only_upstream_proven_udr_formulas:true,
    uses_conjectured_random_words_fri:false,
    candidate_extension_degree:extensionDegree,
    candidate_num_queries:queries,
    modulus_bits_floor:modulusBits,
    actual_native_extension_degree:8,
    actual_native_num_queries:320,
    log_trace_length:LOG_TRACE,
    log_blowup:LOG_BLOWUP,
    max_combo:MAX_COMBO,
    grinding_bits:GRINDING_BITS,
    lookup_interactions:NUM_LOOKUP_INTERACTIONS,
    lookup_width:LOOKUP_WIDTH,
    native_report_attestation_claim:nativeVerifierReportAttested,
    // A claim alone cannot attest executable integrity.
    source_binary_attestation_proved:false,
    conditional_term_bits:screened,
    algebraic_min_term:algebraicBinding,
    entire_screen_min_term:binding,
    research_interactive_target_bits:rbrTarget,
    algebraic_screen_clears_target:algebraicBinding.bits>=rbrTarget,
    all_terms_screen_clears_target:binding.bits>=rbrTarget,
    // This estimator is a classical IOP regime screen. It cannot
    // guarantee *knowledge* or transfer to quantum Fiat-Shamir.
    quantum_adversarial_merkle_extractor_proved:false,
    fri_round_by_round_knowledge_proved:false,
    full_financial_witness_extractor_proved:false,
    cms_qrom_constants_instantiated:false,
    pq128_demonstrated:false,
    production_ready:false,
    release_gate:'HOLD_NO_GO',
  });
}
