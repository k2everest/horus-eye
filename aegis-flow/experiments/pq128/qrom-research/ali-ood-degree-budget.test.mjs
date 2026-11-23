import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalAliOodBudget} from './ali-ood-degree-budget.mjs';

test('without certified polynomial degree caps, no claimed OOD probability is produced',()=>{
  const r=conditionalAliOodBudget({
    traceRows:2**23,airConstraintComponents:100,fieldDegree:8,
  });
  assert.equal(r.ood_exceptional_zeta,null);
  assert.equal(r.conditional_combined_bound,null);
  assert.equal(r.needs_actual_compiled_polynomial_degree_caps,true);
  assert.equal(r.pq128_demonstrated,false);
});
test('illustrative degree caps produce exact rational bound but no certification',()=>{
  const r=conditionalAliOodBudget({
    traceRows:4096,airConstraintComponents:8,
    constraintPolynomialDegreeCap:16384,
    quotientPolynomialDegreeCap:12288,fieldDegree:16,
  });
  // max(16384,4096+12288)=16384; + traceRows=20480, +7=20487
  assert.equal(r.composition_exceptional_alpha.numerator,'7');
  assert.equal(r.ood_exceptional_zeta.numerator,'20480');
  assert.equal(r.conditional_combined_bound.numerator,'20487');
  assert.equal(r.degree_caps_independently_proved,false);
  assert.equal(r.quotient_chunk_recomposition_proved,false);
  assert.equal(r.production_ready,false);
});
test('partial caps and malformed parameters fail closed',()=>{
  for(const o of [
    {traceRows:0,airConstraintComponents:3},
    {traceRows:4096,airConstraintComponents:0},
    {traceRows:4096,airConstraintComponents:3,fieldDegree:0},
    {traceRows:4096,airConstraintComponents:3,constraintPolynomialDegreeCap:-1},
  ])assert.throws(()=>conditionalAliOodBudget(o));
  const partial=conditionalAliOodBudget({
    traceRows:4096,airConstraintComponents:3,
    quotientPolynomialDegreeCap:12000,
  });
  assert.equal(partial.conditional_combined_bound,null);
});
