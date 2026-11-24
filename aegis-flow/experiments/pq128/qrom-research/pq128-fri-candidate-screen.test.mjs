import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePQ128FriCandidate} from './pq128-fri-candidate-screen.mjs';

test('pinned extension8+320-query FRI UDR does not meet 336-bit research threshold',()=>{
  const r=evaluatePQ128FriCandidate({extensionDegree:8,queries:320,
    randomCodewords:8});
  assert.ok(Math.abs(r.alpha_udr-0.5625152587890625)<1e-15);
  assert.ok(r.fri_udr_query_error_bits>265&&r.fri_udr_query_error_bits<266);
  assert.ok(r.fri_udr_commit_error_bits>231&&r.fri_udr_commit_error_bits<232);
  assert.equal(r.fri_udr_terms_clear_research_target,false);
  assert.equal(r.actual_composite_estimator_can_reach_research_target,false);
  assert.equal(r.pq128_demonstrated,false);
});
test('field16 + 512 queries clears FRI UDR sizing but not total QROM security',()=>{
  const r=evaluatePQ128FriCandidate();
  assert.equal(r.selected_research_target_bits,336);
  assert.ok(r.exact_log2_field_size>494&&r.exact_log2_field_size<495);
  assert.ok(r.fri_udr_query_error_bits>424&&r.fri_udr_query_error_bits<426);
  assert.ok(r.fri_udr_commit_error_bits>478&&r.fri_udr_commit_error_bits<480);
  assert.equal(r.fri_udr_terms_clear_research_target,true);
  assert.equal(r.dimension_compatible_hiding_random_count,true);
  // p3-security currently caps the *entire composite* at an external
  // 170-bit collision assumption. Never silently change this cap.
  assert.equal(r.security_estimator_collision_cap_bits,170);
  assert.equal(r.actual_composite_estimator_can_reach_research_target,false);
  assert.equal(r.quantum_oracle_extraction_proved,false);
  assert.equal(r.pq128_demonstrated,false);
});
test('fewer hiding random codewords or only 320 queries do not magically certify',()=>{
  const insufficient=evaluatePQ128FriCandidate({extensionDegree:16,queries:320,
    randomCodewords:8});
  assert.equal(insufficient.dimension_compatible_hiding_random_count,false);
  assert.equal(insufficient.fri_udr_terms_clear_research_target,false);
  assert.equal(insufficient.release_gate,'HOLD_NO_GO');
  const forged=evaluatePQ128FriCandidate({collisionAssumptionBits:512});
  assert.equal(forged.actual_composite_estimator_can_reach_research_target,true);
  assert.equal(forged.collision_qrom_reduction_proved,false);
  assert.equal(forged.pq128_demonstrated,false);
});
test('reject invalid hypothetical profiles',()=>{
  for(const args of [{extensionDegree:0},{queries:0},
    {queries:100000},{randomCodewords:-1},
    {collisionAssumptionBits:700},{extensionDegree:Infinity}]){
      assert.throws(()=>evaluatePQ128FriCandidate(args),/INVALID/);
  }
});
