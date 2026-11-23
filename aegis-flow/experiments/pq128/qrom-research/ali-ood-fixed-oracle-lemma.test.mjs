import test from 'node:test';
import assert from 'node:assert/strict';
import {
 traceVanishingPolynomial,divideByVanishing,
 compositionAtWitnessRow,quotientOodMismatch,enumerateOodChecks,
} from './ali-ood-fixed-oracle-lemma.mjs';

test('x^4-1 has expected roots in F17 and long division recovers the honest quotient',()=>{
  assert.deepEqual([...traceVanishingPolynomial(4,17n)],[16n,0n,0n,0n,1n]);
  const C=[15n,16n,0n,0n,2n,1n]; // (x^4-1)*(x+2)
  const d=divideByVanishing(C,4,17n);
  assert.deepEqual([...d.quotient],[2n,1n]);
  assert.deepEqual([...d.remainder],[0n]);
  assert.equal(d.divisible,true);
  const r=quotientOodMismatch({prime:17n,domainSize:4,
    constraintPolynomial:C,quotientPolynomial:[2n,1n]});
  assert.equal(r.residual_identically_zero,true);
  assert.equal(r.quotient_is_exact_polynomial,true);
  assert.equal(r.conditional_uniform_extension_zeta_bound.numerator,'0');
  assert.equal(r.AIR_LogUp_knowledge_soundness_proved,false);
});
test('malicious quotient mismatches everywhere outside H even if C divisible',()=>{
  const C=[15n,16n,0n,0n,2n,1n];
  const forged=quotientOodMismatch({prime:17n,domainSize:4,
    constraintPolynomial:C,quotientPolynomial:[3n,1n]});
  assert.equal(forged.residual_identically_zero,false);
  assert.equal(forged.residual_degree,4);
  assert.equal(forged.constraint_divisible_by_vanishing,true);
  assert.equal(forged.quotient_is_exact_polynomial,false);
  const x=enumerateOodChecks({prime:17n,domainSize:4,
    constraintPolynomial:C,quotientPolynomial:[3n,1n]});
  assert.equal(x.outside_subgroup_count,13);
  assert.equal(x.exceptional_roots,0);
  assert.equal(x.roots_bounded_by_polynomial_degree,true);
});
test('nondivisible AIR with one exceptional outside-domain root',()=>{
  const x=enumerateOodChecks({prime:17n,domainSize:4,
    constraintPolynomial:[-2n,1n],quotientPolynomial:[0n]});
  assert.equal(x.theorem.constraint_divisible_by_vanishing,false);
  assert.equal(x.theorem.residual_degree,1);
  assert.equal(x.exceptional_roots,1); // zeta=2 is outside {1,4,13,16}
  assert.equal(x.roots_bounded_by_polynomial_degree,true);
  assert.equal(x.theorem.polynomial_degree_commitment_verified,false);
});
test('composition challenge can accidentally cancel real violations',()=>{
  const a=compositionAtWitnessRow({prime:17n,
    componentValues:[1n,1n],alpha:16n});
  assert.equal(a.any_constraint_violated_at_fixed_trace_row,true);
  assert.equal(a.combined_residual_at_challenge,'0');
  assert.equal(a.exceptional_alpha_count_at_most,1);
  const b=compositionAtWitnessRow({prime:17n,
    componentValues:[1n,1n],alpha:2n});
  assert.equal(b.combined_residual_at_challenge,'3');
  assert.equal(b.rbr_knowledge_proved,false);
});
test('honest row of zero constraints cannot be classified as violation',()=>{
  const x=compositionAtWitnessRow({prime:17n,
    componentValues:[0n,0n,0n],alpha:3n});
  assert.equal(x.any_constraint_violated_at_fixed_trace_row,false);
  assert.equal(x.exceptional_alpha_count_at_most,0);
});
test('noncanonical domains, nonfields and malformed coefficients fail closed',()=>{
  assert.throws(()=>traceVanishingPolynomial(4,15n),/PRIME/);
  assert.throws(()=>traceVanishingPolynomial(17,17n),/INVALID_TRACE/);
  assert.throws(()=>quotientOodMismatch({prime:17n,domainSize:4,
    constraintPolynomial:[1],quotientPolynomial:[1n]}),/NONCANONICAL/);
  assert.throws(()=>quotientOodMismatch({prime:17n,domainSize:4,
    constraintPolynomial:[1n],quotientPolynomial:[0n],extensionDegree:0}),/INVALID/);
  assert.throws(()=>enumerateOodChecks({prime:17n,domainSize:3,
    constraintPolynomial:[1n],quotientPolynomial:[0n]}),/NOT_A_VALID/);
});
test('conditional OOD bounds never promote quantum extractability or production',()=>{
  const r=quotientOodMismatch({prime:17n,domainSize:4,
    constraintPolynomial:[1n],quotientPolynomial:[0n],extensionDegree:8});
  assert.equal(r.quotient_fixed_before_zeta_verified,false);
  assert.equal(r.FRI_opening_binding_proved,false);
  assert.equal(r.pq128_demonstrated,false);
  assert.equal(r.production_ready,false);
});
