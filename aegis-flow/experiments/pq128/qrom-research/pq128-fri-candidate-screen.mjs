// Pinned p3-security 0.8.0 FRI UDR query and commit formulas.
// This is a NECESSARY analytic sizing SCREEN, not an implemented
// alternative verifier or a QROM soundness/knowledge proof.
const BASE=2013265921;
const LOG_TRACE=13; // 4096 witness rows, doubled for hiding
const LOG_BLOWUP=3;
const MAX_COMBO=2; // WiredAir StarkAirParams in wired_r1cs.rs
const COLLISION_ESTIMATOR_CAP=170; // CURRENT external assumption in main.rs
const QUERY_BITS=64; // quantum random-oracle query budget exponent
const TARGET=128;
const RESERVED=80; // research target: 128+2*64+80 = 336
const finiteInt=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function evaluatePQ128FriCandidate({
  extensionDegree=16,queries=512,randomCodewords=16,
  collisionAssumptionBits=COLLISION_ESTIMATOR_CAP
}={}){
  if(!finiteInt(extensionDegree,1,32)||
     !finiteInt(queries,1,2048)||
     !finiteInt(randomCodewords,0,64)||
     !finiteInt(collisionAssumptionBits,0,512))
    throw new RangeError('INVALID_PQ128_FRI_CANDIDATE');
  const modulusBits=extensionDegree*Math.log2(BASE);
  const n=2**(LOG_TRACE+LOG_BLOWUP),k=2**LOG_TRACE;
  const alpha=(1+(k+MAX_COMBO)/n)/2;
  // From p3-security v0.8.0 fri::proven_error_udr
  // query_phase_error and commit_phase_error_udr.
  const queryBits=queries*(-Math.log2(alpha));
  const commitBits=modulusBits-Math.log2(n+1);
  const targetBits=TARGET+2*QUERY_BITS+RESERVED;
  const candidateFriUdrBits=Math.min(queryBits,commitBits);
  return Object.freeze({
    schema:'AEGIS_PQ128_FRI_UDR_NECESSARY_SCREEN_V1',
    fixed_native_wired_log_trace_length:LOG_TRACE,
    fixed_native_log_blowup:LOG_BLOWUP,
    fixed_native_max_combo:MAX_COMBO,
    candidate_extension_degree:extensionDegree,
    candidate_queries:queries,
    candidate_random_codewords:randomCodewords,
    actual_native_extension_degree:8,
    actual_native_fri_queries:320,
    actual_native_random_codewords:8,
    alpha_udr:alpha,
    exact_log2_field_size:modulusBits,
    fri_udr_query_error_bits:queryBits,
    fri_udr_commit_error_bits:commitBits,
    fri_udr_min_term_bits:candidateFriUdrBits,
    selected_research_target_bits:targetBits,
    fri_udr_terms_clear_research_target:candidateFriUdrBits>=targetBits,
    dimension_compatible_hiding_random_count:
       randomCodewords>=extensionDegree,
    security_estimator_collision_cap_bits:collisionAssumptionBits,
    actual_composite_estimator_can_reach_research_target:
       Math.min(candidateFriUdrBits,collisionAssumptionBits)>=targetBits,
    // Native 0.8.0 doesn't implement BabyBear16, and 170-bit
    // collision resistance is an ASSUMED estimator cap, not a QROM
    // argument. Increasing it by config would not be a proof.
    candidate_native_field_implemented:false,
    candidate_full_rbr_and_fri_proximity_proved:false,
    collision_qrom_reduction_proved:false,
    quantum_oracle_extraction_proved:false,
    financial_witness_extraction_proved:false,
    pq128_demonstrated:false,
    production_ready:false,
    release_gate:'HOLD_NO_GO',
  });
}
