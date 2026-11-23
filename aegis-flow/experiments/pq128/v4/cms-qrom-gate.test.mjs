import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCmsQromFeasibility} from './cms-qrom-gate.mjs';
test('CMS20 quadratic QROM reduction fails for BabyBear^8 before considering FRI',()=>{
  const x=assessCmsQromFeasibility();
  assert.equal(x.field_extension_degree,8);
  assert.equal(x.logup_interactive_numerator,(1n<<27n).toString());
  assert.equal(x.maximum_hypothetical_events,(1n<<40n).toString());
  assert.equal(x.necessary_under_unit_constants.G1_logup_bound_nonvacuous,false);
  assert.equal(x.necessary_under_unit_constants.G1_hash_bound_nonvacuous,true);
  assert.equal(x.min_extension_degree_for_G1_logup_unit_constants,11);
  assert.equal(x.min_extension_degree_for_G2_logup_unit_constants,15);
  assert.equal(x.sufficient_hash_bits_for_G2_unit_constants,552);
  assert.equal(x.pq128_demonstrated,false);
  assert.equal(x.production_ready,false);
});
test('more extension field cardinality clears only algebraic screen, not proof applicability',()=>{
  const x=assessCmsQromFeasibility({degree:12});
  assert.equal(x.necessary_under_unit_constants.G1_logup_bound_nonvacuous,true);
  assert.equal(x.theorem_applies_to_current_p3_batch_stark,false);
  assert.equal(x.actual_wired_air_rbr_measured,false);
  assert.equal(x.knowledge_soundness_proved,false);
});
test('strong residual hash goal cannot be met by 512-bit ideal digest under same horizon',()=>{
  const x=assessCmsQromFeasibility({degree:16});
  assert.equal(x.necessary_under_unit_constants.G2_logup_bound_nonvacuous,true);
  assert.equal(x.necessary_under_unit_constants.G2_hash_bound_nonvacuous,false);
  assert.equal(assessCmsQromFeasibility({degree:16,hashBits:576})
    .necessary_under_unit_constants.G2_hash_bound_nonvacuous,true);
  for(const a of [{degree:0},{degree:33},{oracleQueries:2},{oracleQueries:0n},
    {receipts:0n},{hashBits:0},{segments:65}])
    assert.throws(()=>assessCmsQromFeasibility(a));
});
