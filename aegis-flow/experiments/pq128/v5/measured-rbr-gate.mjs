// Independent *audit screen* of the actual Plonky3 WiredAir symbolic RBR
// JSON. Does not imply QROM theorem hypotheses, privacy, knowledge or PQ128.
const required=['air-composition','deep-ali','low-degree-test',
  'logup-fingerprint','batch-combination','commitment-collision'];
const fields=['air-composition','deep-ali','low-degree-test',
  'logup-fingerprint','batch-combination'];
const composedBits=xs=>{
  const m=Math.min(...xs);
  return m-Math.log2(xs.reduce((sum,x)=>sum+2**(m-x),0));
};
function verifyRegime(regime){
  if(!regime)return null;
  const terms=regime.terms;
  if(!Array.isArray(terms)||terms.length!==required.length)throw Error('MISSING_OR_UNKNOWN_RBR_TERMS');
  const map=new Map();
  for(const term of terms){
    if(!term||!required.includes(term.label)||typeof term.bits!=='number'||
      !Number.isFinite(term.bits)||term.bits<0||map.has(term.label))
      throw Error('INVALID_RBR_TERM');
    map.set(term.label,term.bits);
  }
  for(const label of required)if(!map.has(label))throw Error('MISSING_RBR_'+label);
  return {
    regime:regime.regime,
    algebraic_terms:Object.fromEntries(fields.filter(label=>map.has(label)).map(label=>[label,map.get(label)])),
    algebraic_union_bound_bits:composedBits(fields.filter(label=>map.has(label)).map(label=>map.get(label))),
    collision_assumption_bits:map.get('commitment-collision'),
  };
}
export function assessMeasuredWiredRbr(report,{rbrTargetBits=336,queryBits=128,
  eventUnionBits=40,unknownConstantReserveBits=32}={}){
  if(!report||report.schema!=='AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1'||
     report.rbr_report_is_for_actual_compiled_wired_air!==true||
     report.qrom_fiat_shamir_reduction_proved!==false||
     !report.rbr_breakdown?.udr)throw new TypeError('UNTRUSTED_WIRED_AIR_RBR_REPORT');
  for(const x of [rbrTargetBits,queryBits,eventUnionBits,unknownConstantReserveBits])
    if(!Number.isSafeInteger(x)||x<0||x>1024)throw new RangeError('INVALID_QROM_BUDGET');
  const udr=verifyRegime(report.rbr_breakdown.udr),
    ldr=verifyRegime(report.rbr_breakdown.ldr);
  const algebraic=Math.max(udr.algebraic_union_bound_bits,
    ldr?.algebraic_union_bound_bits??0);
  const necessary=2*queryBits+eventUnionBits+unknownConstantReserveBits;
  return Object.freeze({
    schema:'AEGIS_V5_MEASURED_WIRED_RBR_QROM_OBLIGATIONS_V1',
    program_sha512:report.program_sha512,
    trace_rows:report.trace_rows,
    lookup_count:report.num_lookups,
    quotient_chunks:report.num_quotient_chunks,
    fri_queries:report.fri_queries,
    reports:{udr,ldr},
    measured_interactive_algebraic_union_bits:algebraic,
    required_interactive_bits:rbrTargetBits,
    necessary_bits_if_CMS_Q2_applies_with_reserved_constants:necessary,
    margin_over_CMS_Q2_necessary_bits:algebraic-necessary,
    reaches_selected_rbr_target:algebraic>=rbrTargetBits,
    theorem_BCS_QROM_instantiated:false,
    theorem_constants_verified:false,
    plonky3_rbr_hash_cap_qualified_separately:false,
    actual_financial_circuit_proved:false,
    zero_knowledge_proved:false,knowledge_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
