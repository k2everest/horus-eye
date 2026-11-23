// Strict research candidate crypto suite; V2's configurable fallback is NOT
// automatically suitable for a default-private PQ128 V5 monetary protocol.
// The NIST Category 5 labels refer to the INDIVIDUAL KEM/signature schemes,
// not to STARK soundness or to complete Aegis PQ128 qualification.
export const QUEER_V5_SUITE=Object.freeze({
  id:'QUEER_V5_PQ_POLICY_CANDIDATE_1',
  standard_KEM:'NIST FIPS 203',
  standard_signature:'NIST FIPS 204',
  kem:'ML-KEM-1024',signature:'ML-DSA-87',
  statement_version:'QUEER_SHIELDED_TRANSFER_V5_CANDIDATE',
  signature_domain:'QUEER_TX_V5',
  network_domain_separation_required:true,
  signature_public_key_reuse_prohibited_for_shielded_spends:true,
  authenticated_encryption_and_key_derivation_requires_separate_review:true,
  downgrade_to_v2_prohibited:true,
  quantum_system_security_qualified:false,
  consensus_enabled:false,production_ready:false,
});
export function assessV5AlgorithmPolicy({suite,signature,kem,networkId,programId,domainTag}={}){
  const ok=suite===QUEER_V5_SUITE.id &&
    signature===QUEER_V5_SUITE.signature&&kem===QUEER_V5_SUITE.kem &&
    typeof networkId==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(networkId)&&
    typeof programId==='string'&&/^[0-9a-f]{128}$/.test(programId) &&
    domainTag===QUEER_V5_SUITE.signature_domain;
  return Object.freeze({
    algorithm_policy_admissible_in_laboratory:ok,
    signature_NIST_FIPS204_category5_selected:ok,
    KEM_NIST_FIPS203_category5_selected:ok,
    actual_public_signature_verified:false,
    actual_shared_secret_authenticated:false,
    transcript_replay_and_downgrade_fully_audited:false,
    complete_PQ128_soundness:false,
    consensus_admission_allowed:false,
    production_ready:false,
  });
}
