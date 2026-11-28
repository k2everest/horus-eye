import test from 'node:test';
import assert from 'node:assert/strict';
import {babyBear16TwoAdicCertificate} from './babybear16-two-adic-certificate.mjs';
test('extension16 DTH_ROOT and all four new FFT generators have exact certified order',()=>{
  const v=babyBear16TwoAdicCertificate();
  assert.equal(v.dth_root,1400279418);
  assert.equal(v.total_two_adicity,31);
  assert.deepEqual(v.extension_generators.map(x=>[
    x.bits,x.canonical_basis_coefficient_index,
    x.canonical_basis_coefficient]),[
      [28,8,929455875],
      [29,12,529583979],
      [30,14,1310212151],
      [31,15,1835875777],
    ]);
  assert.equal(v.exact_2_adic_orders_verified,true);
  assert.equal(v.full_multiplicative_generator_verified,false);
  assert.equal(v.native_binomial_extension_data_16_implemented,false);
  assert.equal(v.pq128_demonstrated,false);
});
test('source-derived roots cannot be promoted into an implemented PQ128 field',()=>{
  const v=babyBear16TwoAdicCertificate();
  assert.equal(v.native_challenger_sampling_verified,false);
  assert.equal(v.fri_pcs_proof_compatibility_verified,false);
  assert.equal(v.production_ready,false);
});
