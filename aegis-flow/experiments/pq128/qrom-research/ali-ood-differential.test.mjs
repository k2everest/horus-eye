import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalAliDeepBudget,exhaustiveAliDeepToy} from './ali-deep-ood-lemma.mjs';
import {conditionalAliOodBudget} from './ali-ood-degree-budget.mjs';
import {enumerateOodChecks} from './ali-ood-fixed-oracle-lemma.mjs';

test('two independently implemented conditional BabyBear degree formulas agree exactly',()=>{
  const common={traceRows:4096,extensionDegree:8};
  const a=conditionalAliDeepBudget({...common,constraintCount:1000,
    foldedConstraintDegreeCeiling:12000,quotientDegreeCeiling:12000});
  const b=conditionalAliOodBudget({...common,airConstraintComponents:1000,
    constraintPolynomialDegreeCap:12000,quotientPolynomialDegreeCap:12000});
  assert.equal(a.union_bound.numerator,b.conditional_combined_bound.numerator);
  assert.equal(a.union_bound.denominator,b.conditional_combined_bound.denominator);
  assert.equal(b.degree_caps_independently_proved,false);
  assert.equal(a.round_by_round_knowledge_proved,false);
  assert.equal(b.quantum_knowledge_soundness_proved,false);
});
test('independent exhaustive OOD checker agrees on alpha-cancellation counterexample',()=>{
  const base=exhaustiveAliDeepToy({
    prime:17,traceRows:4,constraints:[[1n],[16n]],chooseQuotient:()=>[],
  });
  let sum=0;
  for(let alpha=0n;alpha<17n;alpha++){
    const folded=[(1n-alpha+17n)%17n];
    const result=enumerateOodChecks({prime:17n,domainSize:4,
      constraintPolynomial:folded,quotientPolynomial:[0n]});
    sum+=result.accepted_outside_domain_points;
  }
  assert.equal(base.folding_cancellation_rho_count,1);
  assert.equal(sum,base.observed_acceptances_outside_domain);
  assert.equal(sum,13);
});
