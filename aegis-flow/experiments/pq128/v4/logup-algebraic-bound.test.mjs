import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFixedInteractiveLogup} from './logup-algebraic-bound.mjs';

test('exact BabyBear^8 field arithmetic and conservative Max-profile fixed-query algebraic bound',()=>{
  const r=inspectFixedInteractiveLogup({gates:8_000_000,wires:8_388_608});
  const p=2013265921n**8n;
  const t=3n*8_000_000n+8_388_608n;
  const n=t*(t-1n)/2n+2n*t;
  assert.equal(BigInt(r.extension_field_cardinality),p);
  assert.equal(BigInt(r.multiset_size_upper_bound),t);
  assert.equal(BigInt(r.conditional_single_proof_error_upper_bound.numerator),n);
  assert.equal(BigInt(r.conditional_single_proof_error_upper_bound.denominator),p);
  assert.equal(BigInt(r.hypothetical_union_error_upper_bound.numerator),(1n<<32n)*64n*n);
  assert.equal(r.classical_fixed_challenge_union_below_half,true);
  assert.equal(r.classical_fixed_challenge_union_below_2_minus_128,true);
  assert.equal(r.qrom_adaptive_security_proved,false);
  assert.equal(r.fiat_shamir_compiler_proved,false);
  assert.equal(r.full_logup_argument_soundness_proved,false);
  assert.equal(r.complete_financial_proof_passed,false);
  assert.equal(r.aegis_target_met,false);
  assert.equal(r.production_ready,false);
});

test('zero or out-of-profile row/gate counts reject, never approve quantum soundness',()=>{
  for(const args of [
    {},{gates:0,wires:2},{gates:8_000_001,wires:2},
    {gates:4,wires:1},{gates:2,wires:8_388_609},
    {gates:1,wires:2,receipts:0n},
    {gates:1,wires:2,receipts:1},
    {gates:1,wires:2,segments:65},
  ])assert.throws(()=>inspectFixedInteractiveLogup(args));
  const r=inspectFixedInteractiveLogup({gates:1,wires:2,receipts:1n,segments:1});
  assert.equal(r.multiset_size_upper_bound,'5');
  assert.equal(r.conditional_single_proof_error_upper_bound.numerator,'20');
  assert.equal(r.aegis_target_met,false);
});
