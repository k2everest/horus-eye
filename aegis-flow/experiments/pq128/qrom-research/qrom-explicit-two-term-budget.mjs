// Strictly CONDITIONAL, log-domain numerical bookkeeping for the
// CMS-style QROM form:
//
//    Adv <= C1*Q^2*epsilon_RBR + C2*Q^3*2^(-lambda).
//
// This is NOT an instantiation of the theorem and NOT a PQ128 proof.
// The input epsilon_RBR must be a *proved round-by-round KNOWLEDGE*
// bound for the EXACT native protocol, not merely p3-security's
// interactive algebraic soundness or a mock shape estimate.
// Configured C1,C2 are unsupported unless independently proved.
const okInt=(v,lo,hi)=>Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const requireInt=(v,lo,hi,key)=>{
  if(!okInt(v,lo,hi))throw new TypeError('UNSUPPORTED_QROM_'+key);
};
const unionBits=(bits1,bits2)=>{
  const m=Math.min(bits1,bits2),delta=Math.abs(bits1-bits2);
  return m-Math.log2(1+2**(-delta));
};
export function conditionalQromSecurityScreen({
  rbrKnowledgeBits,hashDigestBits=512,
  quantumOracleQueryBits=64,proofOverheadBits=80,
  targetBits=128,
}={}){
  if(typeof rbrKnowledgeBits!=='number'||!Number.isFinite(rbrKnowledgeBits)||
     rbrKnowledgeBits<0||rbrKnowledgeBits>1024)
    throw new TypeError('UNSUPPORTED_QROM_RBR_KNOWLEDGE_BITS');
  requireInt(hashDigestBits,1,1024,'HASH_OUTPUT');
  requireInt(quantumOracleQueryBits,0,256,'QUANTUM_QUERIES');
  requireInt(proofOverheadBits,0,256,'PROOF_OVERHEAD');
  requireInt(targetBits,1,512,'TARGET');
  // Epsilon values are individually raised by Q^2, Q^3 respectively.
  // One overestimate of C1,C2 <= 2^overhead, *plus* all other losses,
  // is only a hypothetical assumption; not a proof about the backend.
  const rbrExponent=rbrKnowledgeBits-
    2*quantumOracleQueryBits-proofOverheadBits;
  const collisionExponent=hashDigestBits-
    3*quantumOracleQueryBits-proofOverheadBits;
  const combined=unionBits(rbrExponent,collisionExponent);
  return Object.freeze({
    schema:'AEGIS_QROM_TWO_TERM_CONDITIONAL_NUMERICAL_SCREEN_V1',
    source_form:'O(Q^2*epsilon_RBR + Q^3/2^lambda)',
    qrom_query_budget_exponent:quantumOracleQueryBits,
    hash_digest_bits:hashDigestBits,
    assumed_log2_constants_and_total_event_margin:proofOverheadBits,
    assumed_rbr_knowledge_bits:rbrKnowledgeBits,
    final_rbr_term_bits:rbrExponent,
    final_hash_collision_term_bits:collisionExponent,
    conditional_union_security_bits:combined,
    conditional_numeric_screen_clears_target:combined>=targetBits,
    actual_native_rbr_knowledge_bit_lower_bound_proved:false,
    actual_native_field16_implemented:false,
    actual_sha512_qrom_ideal_oracle_reduction_proved:false,
    actual_qrom_compiler_constants_bounded:false,
    actual_merkle_online_quantum_extraction_proved:false,
    full_financial_witness_extracted:false,
    zero_knowledge_and_unlinkability_proved:false,
    pq128_demonstrated:false,
    release_gate:'HOLD_NO_GO',
    production_ready:false,
  });
}
