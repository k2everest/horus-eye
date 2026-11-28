import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateBabyBearDegree16} from './babybear16-field-candidate.mjs';
test('BabyBear p-1=15*2^27, and 11 is a non-square: X^16-11 irreducible',()=>{
  const c=evaluateBabyBearDegree16();
  assert.equal(c.base_field_two_adic_order,27);
  assert.equal(c.base_field_odd_order,15);
  assert.equal(c.legendre_symbol,-1);
  assert.equal(c.irreducibility_by_multiplicative_order_proved,true);
  assert.ok(c.extension_field_bits>494&&c.extension_field_bits<495);
  assert.equal(c.pinned_plonky3_0_8_extension_16_implemented,false);
  assert.equal(c.native_field_migration_tested,false);
  assert.equal(c.pq128_demonstrated,false);
});
test('square w=2 must be rejected as a proposed degree16 binomial field',()=>{
  const c=evaluateBabyBearDegree16(2);
  assert.equal(c.legendre_symbol,1);
  assert.equal(c.irreducibility_by_multiplicative_order_proved,false);
});
test('unsupported candidate arguments reject instead of certifying',()=>{
  assert.throws(()=>evaluateBabyBearDegree16(0),/INVALID/);
  assert.throws(()=>evaluateBabyBearDegree16(2013265921),/INVALID/);
  assert.throws(()=>evaluateBabyBearDegree16(1.5),/INVALID/);
});
