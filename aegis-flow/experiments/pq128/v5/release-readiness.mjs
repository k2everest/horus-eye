// Fail-closed commercial release policy. Research evidence cannot be
// promoted by passing an untrusted JSON flag. A new reviewed verifier,
// attestation scheme and independent audit are required to amend this code.
// "Approved by tests" is never a cryptographic proof of PQ128.
import {buildV4QuantumDossier} from '../v4/pq128-formal-dossier.mjs';
import {compareFieldProfiles} from './field-comparison.mjs';
export function v5ReleaseReadiness(){
 const dossier=buildV4QuantumDossier(),comparison=compareFieldProfiles();
 const conditions=Object.freeze({
  candidate_extension_math_checked:comparison.profiles.some(p=>
    p.name==='babybear16-candidate'&&p.candidate_irreducibility_certified),
  candidate_extension_native_and_pcs_qualified:false,
  actual_financial_six_sha512_native_proof_accepted:false,
  wired_air_ali_deep_fri_logup_batch_rbr_ge_336:false,
  BCS_qrom_theorem_with_concrete_constants_proved:false,
  global_qrom_composition_and_hash_security_proved:false,
  quantum_proof_of_knowledge_proved:false,
  quantum_zero_knowledge_and_unlinkability_proved:false,
  ml_dsa87_and_ml_kem1024_end_to_end_audited:false,
  mainnet_consensus_mining_wallet_p2p_audited:false,
  independent_external_crypto_audit_signed_and_verified:false,
  reproducible_release_attested:false,
 });
 const pending=Object.entries(conditions).filter(([name,ok])=>!ok).map(([name])=>name);
 if(dossier.pq128_demonstrated!==false||dossier.production_ready!==false)
   throw new Error('RESEARCH_SOURCE_FALSIFIED_SECURITY_STATUS');
 return Object.freeze({
  schema:'QUEER_V5_COMMERCIAL_RELEASE_FAIL_CLOSED_V1',
  policy:'NO_TOKEN_SALE_MAINNET_OR_PUBLIC_COMMERCIALIZATION_UNTIL_PQ128',
  conditions,pending,commercial_release_allowed:false,mainnet_financial_activation_allowed:false,
  security_certificate_accepted:false,arbitrary_prover_attestation_trusted:false,
  changes_to_policy_require_independent_security_review:true,
 });
}
if(process.argv[1]?.endsWith('release-readiness.mjs')){
 const result=v5ReleaseReadiness();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(process.argv.includes('--authorize-commercial-release'))process.exit(1);
}
