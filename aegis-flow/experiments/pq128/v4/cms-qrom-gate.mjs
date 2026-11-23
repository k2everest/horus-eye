// Necessary-parameter feasibility test for the CMS20 BCS QROM theorem.
// Theorem 3 (informal), Chiesa-Manohar-Spooner, ePrint 2019/834:
//   Adv_BCS(t) = O(t^2 * eps_RBR + t^3 / 2^lambda)
// for BCS applied to public-coin IOPs with round-by-round soundness.
// UNKNOWN big-O constants and applicability to the exact Plonky3/LogUp
// suite prevent promoting any "passing" configuration.
// We show impossibility of CERTIFYING the current field via this
// *upper bound*; we do NOT demonstrate an attack on the actual STARK.
const P=2013265921n;
const Q=1n<<128n;
const H=1n<<32n;
const SEGMENTS=64n;
const EVENT_FAMILIES=4n;
const EVENTS=H*SEGMENTS*EVENT_FAMILIES;
const ROWS=1n<<23n;
const N_INTERACTIONS=4n*ROWS;
const W=2n;
const LOGUP_NUM=N_INTERACTIONS*(W+2n);
const MAX_DEGREE=32;
const validInt=(n,min,max,name)=>{
  if(!Number.isSafeInteger(n)||n<min||n>max)
    throw new TypeError('invalid '+name);
};
function smallestDegreeFor(factor){
  for(let d=1;d<=MAX_DEGREE;d++){
    if(P**BigInt(d) > factor)return d;
  }
  return null;
}
export function assessCmsQromFeasibility({
  degree=8,oracleQueries=Q,receipts=H,segments=Number(SEGMENTS),
  eventFamilies=Number(EVENT_FAMILIES),hashBits=512,
}={}){
  validInt(degree,1,MAX_DEGREE,'degree');
  validInt(segments,1,64,'segments');
  validInt(eventFamilies,1,64,'eventFamilies');
  validInt(hashBits,1,2048,'hashBits');
  if(typeof oracleQueries!=='bigint'||oracleQueries<1n||
    oracleQueries>(1n<<256n)||
    typeof receipts!=='bigint'||receipts<1n||receipts>(1n<<64n))
    throw new TypeError('invalid quantum query budget');
  const evt=receipts*BigInt(segments)*BigInt(eventFamilies);
  const field=P**BigInt(degree);
  const logupTermNumerator=evt*oracleQueries**2n*LOGUP_NUM;
  // CMS20 uses O(...), so the prefactor 1 is a purely optimistic
  // illustration, NOT an applicable, concrete theorem instance.
  const hashTermNumerator=evt*oracleQueries**3n;
  const hashSpace=1n<<BigInt(hashBits);
  const g1PossibleLogup=2n*logupTermNumerator < field;
  const g1PossibleHash=2n*hashTermNumerator < hashSpace;
  const g2PossibleLogup=(logupTermNumerator<<128n)<=field;
  const g2PossibleHash=(hashTermNumerator<<128n)<=hashSpace;
  return Object.freeze({
    schema:'AEGIS_V4_CMS_BCS_QROM_NECESSARY_PARAMETER_SCREEN_V1',
    reference:'Chiesa Manohar Spooner 2020, ePrint 2019/834, Thm 3 informal',
    theorem_form:'O(Q^2 * RBR_error + Q^3 / 2^hash_bits)',
    theorem_is_specific_to_BCS_of_RBR_IOP:true,
    target_G1:'success < 1/2 for at most Q=2^128 global oracle queries',
    target_G2:'residual <= 2^-128 after Q=2^128 queries',
    field_extension_degree:degree,
    field_size:field.toString(),
    logup_interactive_numerator:LOGUP_NUM.toString(),
    lookup_row_capacity:ROWS.toString(),
    maximum_hypothetical_events:evt.toString(),
    hypothetical_cms_qrom_logup_term:{
      numerator:logupTermNumerator.toString(),denominator:field.toString(),
    },
    hypothetical_cms_qrom_hash_term:{
      numerator:hashTermNumerator.toString(),denominator:hashSpace.toString(),
    },
    necessary_under_unit_constants:{
      G1_logup_bound_nonvacuous:g1PossibleLogup,
      G1_hash_bound_nonvacuous:g1PossibleHash,
      G2_logup_bound_nonvacuous:g2PossibleLogup,
      G2_hash_bound_nonvacuous:g2PossibleHash,
    },
    min_extension_degree_for_G1_logup_unit_constants:
      smallestDegreeFor(2n*logupTermNumerator),
    min_extension_degree_for_G2_logup_unit_constants:
      smallestDegreeFor(logupTermNumerator*(1n<<128n)),
    sufficient_hash_bits_for_G1_unit_constants:
      (2n*hashTermNumerator).toString(2).length,
    sufficient_hash_bits_for_G2_unit_constants:
      (hashTermNumerator*(1n<<128n)-1n).toString(2).length,
    theorem_constant_known:false,
    theorem_applies_to_current_p3_batch_stark:false,
    actual_wired_air_rbr_measured:false,
    merkle_commitment_quantum_extraction_proved:false,
    transcript_typed_and_qrom_instantiated:false,
    knowledge_soundness_proved:false,
    zero_knowledge_proved:false,
    pq128_demonstrated:false,
    production_ready:false,
    conclusion:g1PossibleLogup?'FIELD_IS_NOT_THE_IMMEDIATE_CMS_BOTTLENECK_BUT_THEOREM_UNINSTANTIATED':
      'BABYBEAR_DEGREE_8_CANNOT_BE_CERTIFIED_VIA_CMS_Q2_BCS_BOUND',
  });
}
