import test from 'node:test';
import assert from 'node:assert/strict';
import {assessLogupQromReduction} from './logup-qrom-branches.mjs';

test('exact native p3-security fingerprint term is a four-interaction two-field LogUp',()=>{
  const b=assessLogupQromReduction();
  assert.equal(BigInt(b.base_interactive_fingerprint.numerator),
    4n*(1n<<23n)*(2n+2n));
  assert.equal(BigInt(b.base_interactive_fingerprint.denominator),2013265921n**8n);
  assert.equal(b.composition_events_if_valid,((1n<<32n)*64n*4n).toString());
  assert.equal(b.branches[0].sufficient_for_g1_half_probability_if_applicable,true);
  assert.equal(b.branches[0].sufficient_for_g2_residual_2_minus_128_if_applicable,false);
  assert.equal(b.branches[1].sufficient_for_g1_half_probability_if_applicable,false);
  assert.equal(b.qrom_query_loss_exponent_proved,null);
  assert.equal(b.quantum_compiler_applicability_proved,false);
  assert.equal(b.pq128_demonstrated,false);
  assert.equal(b.production_ready,false);
});
test('challenge cardinality cannot be silently boosted by salt entropy',()=>{
  const b=assessLogupQromReduction({challengeDegree:8});
  assert.equal(b.extension_degree,8);
  assert.ok(b.branches[1].required_extension_degree_for_g1_at_this_fixed_shape>8);
  for(const args of [{challengeDegree:0},{logTrace:24},{interactionColumnsPerRow:0},
    {messageWidth:0},{queries:0n},{queries:2},{receipts:0n},{segments:65}])
    assert.throws(()=>assessLogupQromReduction(args));
});
