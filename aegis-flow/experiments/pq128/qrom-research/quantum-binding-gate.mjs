// Fail-closed quantum commitment/field-capacity audit for the currently
// pinned WiredAir lab. This is a necessary-condition screen, not a proof.
// Do not use report-supplied values to override the actual native config:
// Plonky3 v0.8.0 BabyBear^8, SHA-512 leaf/node, Merkle cap height 3.
const P=2013265921;
const PINNED_EXTENSION_DEGREE=8;
const PINNED_DIGEST_BITS=512;
const PINNED_CAP_HEIGHT=3;
const int=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
export function assessPinnedQuantumBinding({
  targetBits=128,quantumOracleQueryBits=64,
  reserveBits=0,candidateExtensionDegree=16,
}={}){
  if(!int(targetBits,1,512)||!int(quantumOracleQueryBits,0,256)||
     !int(reserveBits,0,256)||
     !int(candidateExtensionDegree,2,32))
    throw new TypeError('INVALID_QUANTUM_BINDING_BUDGET');
  const required=targetBits+2*quantumOracleQueryBits+reserveBits;
  const actualCapacity=PINNED_EXTENSION_DEGREE*Math.log2(P);
  const candidateCapacity=candidateExtensionDegree*Math.log2(P);
  // These are ideal random-oracle, heuristic screens only. Quantum
  // collision search can have success O(Q^3/2^lambda); constants,
  // multi-target accounting and real SHA512 assumptions are unresolved.
  const idealCollisionTermBits=PINNED_DIGEST_BITS-
    3*quantumOracleQueryBits;
  return Object.freeze({
    schema:'AEGIS_NATIVE_SHA512_MERKLE_QUANTUM_BINDING_GATE_V1',
    field_prime:P,
    actual_native_extension_degree:PINNED_EXTENSION_DEGREE,
    candidate_extension_degree:candidateExtensionDegree,
    actual_extension_field_bits:actualCapacity,
    candidate_extension_field_bits:candidateCapacity,
    actual_field_meets_minimum_q2_screen:actualCapacity>=required,
    candidate_field_meets_minimum_q2_screen:candidateCapacity>=required,
    required_interactive_bits_for_q2_term:required,
    ideal_sha512_quantum_collision_term_bits:idealCollisionTermBits,
    ideal_collision_term_meets_128_bits:idealCollisionTermBits>=targetBits,
    native_digest_bits:PINNED_DIGEST_BITS,
    native_merkle_cap_height:PINNED_CAP_HEIGHT,
    native_hash_domain_separation_present:true,
    // Collision resistance -> classical position binding (under exact
    // shape/injective encoding) but NOT quantum collapsing/oracle extraction.
    position_binding_reduction_conditional_on_sha512_collision_resistance:true,
    multi_height_merkle_semantics_proved_for_all_adversaries:false,
    sha512_collapsing_in_qrom_proved:false,
    quantum_collapse_binding_proved:false,
    quantum_full_oracle_extraction_proved:false,
    fri_proximity_rbr_knowledge_proved:false,
    financial_knowledge_extraction_proved:false,
    cms_qrom_reduction_instantiated:false,
    quantum_128_bits_certified:false,
    production_ready:false,
    release_gate:'HOLD_NO_GO',
  });
}
