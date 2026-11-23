// Consolidated, reproducible post-quantum research report. No row in this
// report authorizes mainnet/testnet acceptance or PQ128 certification.
// All three arithmetic bounds require different hypotheses and MUST NOT
// be multiplied, conflated, or used as a full-proof soundness bound.
import {screenV4OuterBinding} from './outer-screen.mjs';
import {inspectFixedInteractiveLogup} from './logup-algebraic-bound.mjs';
import {screenQuantumSaltSearch} from './salt-quantum-screen.mjs';
import {assessLogupQromReduction} from './logup-qrom-branches.mjs';
import {assessCmsQromFeasibility} from './cms-qrom-gate.mjs';
import {pq128EngineeringTarget} from './pq128-engineering-target.mjs';

export function buildV4QuantumDossier(){
  const outer=screenV4OuterBinding();
  const logup=inspectFixedInteractiveLogup({
    gates:8_000_000,wires:8_388_608,
  });
  const salt=screenQuantumSaltSearch({salts:16});
  const qromBranches=assessLogupQromReduction();
  const cms=assessCmsQromFeasibility();
  const target=pq128EngineeringTarget();
  const output={
    schema:'AEGIS_V4_QUANTUM_PROOF_OBLIGATIONS_V1',
    date:'2026-11-22',
    suite:'AEGIS_V4_P3_HIDING_EXT8_LAB_V1',
    target:{
      model:'global-quantum-query-security-game',
      maximum_quantum_oracle_queries:(1n<<128n).toString(),
      hypothetical_receipts:(1n<<32n).toString(),
      max_segments:64,adversary_success_upper_bound:'1/2',
      stronger_residual_2_minus_128_is_distinct:true,
      assumptions_are_not_network_rate_limits:true,
    },
    conditional_components:{
      ideal_outer_512bit_QROM:outer,
      fixed_interactive_logup:logup,
      generic_salt_grover_screen:salt,
      logup_qrom_hypothesis_branches:qromBranches,
      cms20_BCS_QROM_necessary_parameter_screen:cms,
      candidate_16_extension_unimplemented_engineering_target:target,
    },
    critical_unknowns:{
      actual_wired_air_fri_logup_rbr_error:null,
      quantum_compatible_state_restoration_reduction:null,
      concrete_fiat_shamir_BCS_QROM_compiler_error:null,
      adaptive_multi_receipt_error:null,
      merkle_MMCS_SHA512_quantum_binding:null,
      knowledge_extraction_error:null,
      complete_zero_knowledge_advantage:null,
      full_six_SHA512_native_proof_accepted:null,
      source_binary_independent_attestation:null,
    },
    verified_finite_native_logup_smoke:true,
    full_financial_relation_native_verified:false,
    pq128_demonstrated:false,
    security_claim_approved:false,
    production_ready:false,
    consensus_activation:false,
    verdict:'NOT_DEMONSTRATED_MISSING_FULL_QROM_SOUNDNESS_KNOWLEDGE_PRIVACY',
  };
  // Every unknown remains null; fail closed if an arithmetic screen
  // unexpectedly generates an asserted success.
  if(outer.aegis_target_met!==false||logup.aegis_target_met!==false||
    salt.aegis_target_met!==false||
    qromBranches.qrom_query_loss_exponent_proved!==null||
    cms.theorem_applies_to_current_p3_batch_stark!==false||
    cms.pq128_demonstrated!==false||
    target.proposed_field_constructed_and_audited!==false||
    target.actual_FRI_soundness_bits!==null||
    output.pq128_demonstrated!==false||output.production_ready!==false)
    throw new Error('unqualified security promotion detected');
  return output;
}
if(process.argv[1]?.endsWith('pq128-formal-dossier.mjs')){
  process.stdout.write(JSON.stringify(buildV4QuantumDossier(),null,2)+'\n');
}
