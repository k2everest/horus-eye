import test from 'node:test';
import assert from 'node:assert/strict';
import {buildV4QuantumDossier} from './pq128-formal-dossier.mjs';

test('conditional component screens never become a PQ128 soundness claim',()=>{
  const d=buildV4QuantumDossier();
  assert.equal(d.schema,'AEGIS_V4_QUANTUM_PROOF_OBLIGATIONS_V1');
  assert.equal(d.conditional_components.ideal_outer_512bit_QROM.conditional_half_success_criterion,true);
  assert.equal(d.conditional_components.fixed_interactive_logup.classical_fixed_challenge_union_below_half,true);
  assert.equal(d.conditional_components.generic_salt_grover_screen.conditional_residual_target_met,true);
  assert.equal(d.critical_unknowns.quantum_compatible_state_restoration_reduction,null);
  assert.equal(d.critical_unknowns.actual_wired_air_fri_logup_rbr_error,null);
  assert.equal(d.critical_unknowns.full_six_SHA512_native_proof_accepted,null);
  const cms=d.conditional_components.cms20_BCS_QROM_necessary_parameter_screen;
  assert.equal(cms.necessary_under_unit_constants.G1_logup_bound_nonvacuous,false);
  assert.equal(cms.min_extension_degree_for_G1_logup_unit_constants,11);
  assert.equal(cms.theorem_applies_to_current_p3_batch_stark,false);
  assert.equal(d.full_financial_relation_native_verified,false);
  assert.equal(d.pq128_demonstrated,false);
  assert.equal(d.security_claim_approved,false);
  assert.equal(d.production_ready,false);
  assert.equal(d.consensus_activation,false);
});
