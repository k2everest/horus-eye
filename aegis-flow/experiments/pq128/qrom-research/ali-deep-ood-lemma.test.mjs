import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conditionalAliDeepBudget,exhaustiveAliDeepToy,
  demonstrateLateQuotientAttack,
} from './ali-deep-ood-lemma.mjs';

test('conditional full-size field budget stays separate from all PQ128 claims',()=>{
  const r=conditionalAliDeepBudget({
    traceRows:4096,constraintCount:1000,
    foldedConstraintDegreeCeiling:12000,quotientDegreeCeiling:12000,
    extensionDegree:8,
  });
  assert.equal(r.algebraic_bad_composition_count,'999');
  assert.equal(r.algebraic_ood_roots_count,'16096');
  assert.equal(r.conservative_domain_hit_count,'4096');
  assert.ok(r.conditional_security_bits>220&&r.conditional_security_bits<240);
  assert.equal(r.verifier_owned_degree_constraints_proved,false);
  assert.equal(r.round_by_round_knowledge_proved,false);
  assert.equal(r.pq128_demonstrated,false);
});
test('increasing extension degree only improves a CONDITIONAL bound',()=>{
  const params={traceRows:4096,constraintCount:1000,
    foldedConstraintDegreeCeiling:12000,quotientDegreeCeiling:12000};
  const x=conditionalAliDeepBudget({...params,extensionDegree:8});
  const y=conditionalAliDeepBudget({...params,extensionDegree:16});
  assert.ok(y.conditional_security_bits>x.conditional_security_bits+240);
  assert.equal(y.pq128_demonstrated,false);
});
test('fail closed on non-power-of-two trace, missing degrees and invalid counts',()=>{
  assert.throws(()=>conditionalAliDeepBudget({
    traceRows:3,constraintCount:2,
    foldedConstraintDegreeCeiling:1,quotientDegreeCeiling:1,
  }));
  assert.throws(()=>conditionalAliDeepBudget({
    traceRows:4096,constraintCount:0,
    foldedConstraintDegreeCeiling:1,quotientDegreeCeiling:1,
  }));
  assert.throws(()=>conditionalAliDeepBudget({
    traceRows:4096,constraintCount:2,
    foldedConstraintDegreeCeiling:-1,quotientDegreeCeiling:1,
  }));
  assert.throws(()=>conditionalAliDeepBudget());
});
test('complete small-field search catches a single cancellation challenge rho=1',()=>{
  const r=exhaustiveAliDeepToy({
    prime:17,traceRows:4,
    constraints:[[1n],[16n]],
    chooseQuotient:()=>[],
  });
  assert.equal(r.folding_cancellation_rho_count,1);
  assert.equal(r.folding_cancellation_at_most,1);
  assert.equal(r.ood_domain_hits,68);
  assert.equal(r.observed_acceptances_outside_domain,13);
  assert.equal(r.root_bound_checked_for_all_rho,true);
  assert.equal(r.union_bound_conservative_compatible,true);
  assert.equal(r.real_wired_air_knowledge_proved,false);
});
test('malicious quotient may depend on rho, but never sees zeta',()=>{
  const r=exhaustiveAliDeepToy({
    prime:17,traceRows:4,
    constraints:[[1n,1n],[0n,1n]],
    chooseQuotient:rho=>[(rho+1n)%17n],
  });
  assert.equal(r.root_bound_checked_for_all_rho,true);
  assert.equal(r.quotient_may_adapt_to_rho_but_not_zeta,true);
  assert.equal(r.folding_cancellation_rho_count<=1,true);
});
test('reject an already valid set of constraints instead of assuming falsity',()=>{
  assert.throws(()=>exhaustiveAliDeepToy({
    prime:17,traceRows:4,
    constraints:[[]],chooseQuotient:()=>[],
  }),/ALL_CONSTRAINTS_ALREADY_VALID/);
});
test('zeta-adaptive constant quotient forges EVERY outside-domain OOD check',()=>{
  const r=demonstrateLateQuotientAttack({
    prime:17,traceRows:4,foldedConstraints:[1n],
  });
  assert.equal(r.zeta_outside_domain_count,13);
  assert.equal(r.successful_post_zeta_forgery_count,13);
  assert.equal(r.forgery_success_fraction_given_ood,'1');
  assert.equal(r.applicable_to_real_plonky3,false);
});
test('toy evaluator rejects composite primes and noncanonical coefficients',()=>{
  assert.throws(()=>exhaustiveAliDeepToy({
    prime:15,traceRows:2,constraints:[[1n]],chooseQuotient:()=>[],
  }),/NONPRIME/);
  assert.throws(()=>exhaustiveAliDeepToy({
    prime:17,traceRows:4,constraints:[[17n]],chooseQuotient:()=>[],
  }),/INVALID_CANONICAL_POLYNOMIAL/);
  assert.throws(()=>exhaustiveAliDeepToy({
    prime:17,traceRows:4,constraints:[[1n]],chooseQuotient:()=>[17n],
  }),/INVALID_CANONICAL_POLYNOMIAL/);
});
