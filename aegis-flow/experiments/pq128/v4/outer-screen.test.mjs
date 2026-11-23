import test from 'node:test';
import assert from 'node:assert/strict';
import {screenV4OuterBinding} from './outer-screen.mjs';

test('512-bit full-width candidate defeats the trivial *ideal outer collision bound* for Q=2^128',()=>{
  const v=screenV4OuterBinding();
  const f=v.ideal_upper_bound;
  assert.equal(v.conditional_half_success_criterion,true);
  assert.equal(v.conditional_residual_criterion,false);
  assert.equal(v.sufficient_ideal_output_bits_for_residual,555);
  assert.equal(v.demonstrated_composite_quantum_soundness,null);
  assert.equal(v.aegis_target_met,false);
  assert.ok(BigInt(f.numerator)*2n < BigInt(f.denominator));
  assert.ok(BigInt(f.numerator)*(1n<<85n) < BigInt(f.denominator));
  assert.equal(v.applicability.sdk_internal_hashes_are_512_bit,false);
});
test('a larger output is only an oracle-sizing example, not a stronger concrete SHA512 digest',()=>{
  const v=screenV4OuterBinding({idealHashBits:576});
  assert.equal(v.conditional_residual_criterion,true);
  assert.equal(v.hash_bits_in_experimental_outer_codec,512);
  assert.equal(v.applicability.uniform_random_oracle_matches_sha512,false);
  assert.equal(v.production_ready,false);
});
test('exact tiny vectors and malformed budgets do not create synthetic proofs',()=>{
  const v=screenV4OuterBinding({receipts:1n,segmentsPerReceipt:1,oracleQueries:1n,idealHashBits:32});
  assert.equal(v.scenario.abstract_outer_candidate_pairs,'6');
  assert.deepEqual(v.ideal_upper_bound,{numerator:'123',denominator:'268435456'});
  assert.equal(v.sufficient_ideal_output_bits_for_residual,139);
  for(const input of [{receipts:0n},{receipts:3},{oracleQueries:0n},
    {idealHashBits:0},{segmentsPerReceipt:65},{targetResidualBits:0}])
    assert.throws(()=>screenV4OuterBinding(input),TypeError);
});
