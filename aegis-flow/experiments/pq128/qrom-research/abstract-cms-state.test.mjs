import test from 'node:test';
import assert from 'node:assert/strict';
import {wiredRoundSchedule} from './round-state.mjs';
import {evaluateAbstractCmsState} from './abstract-cms-state.mjs';
const s=wiredRoundSchedule({friLogArities:[1,1],friQueries:320});
const ids=s.steps.map(x=>x.id);
const challenge=s.verifier_challenges;

test('candidate starts at zero and cannot revive on a prover event',()=>{
  for(let j=0;j<=ids.length;j++){
    const r=evaluateAbstractCmsState(s,ids.slice(0,j));
    assert.equal(r.abstract_candidate_state_bit,0);
    assert.equal(r.prover_move_axiom_holds_for_this_trace,true);
    assert.equal(r.universal_state_axioms_proved,false);
  }
});
test('witness already present before lookup challenge may trigger a toy 0-to-1 transition',()=>{
  const i=ids.indexOf('lookup_alpha');
  const prior=evaluateAbstractCmsState(s,ids.slice(0,i),{
    preChallengeWitnessAvailableAt:['lookup_alpha'],
  });
  const after=evaluateAbstractCmsState(s,ids.slice(0,i+1),{
    preChallengeWitnessAvailableAt:['lookup_alpha'],
  });
  assert.equal(prior.abstract_candidate_state_bit,0);
  assert.equal(after.abstract_candidate_state_bit,1);
  assert.equal(after.transitions[0].cause,'IDEAL_PRE_CHALLENGE_WITNESS');
  assert.equal(after.polynomial_financial_extractor_proved,false);
});
test('abstract bad challenge may cause transition, but not a knowledge claim',()=>{
  const r=evaluateAbstractCmsState(s,ids,{exceptionalChallengeAt:['fri_query_indices'],
    finalVerifierAccepted:true});
  assert.equal(r.abstract_candidate_state_bit,1);
  assert.equal(r.transitions.length,1);
  assert.equal(r.transitions[0].cause,'IDEAL_BAD_CHALLENGE');
  assert.equal(r.all_bad_challenge_probabilities_bounded,false);
  assert.equal(r.terminal_coverage_on_this_trace,true);
  assert.equal(r.bcs_qrom_instantiated,false);
});
test('accepted with neither witness nor bad challenge FAILS the terminal axiom',()=>{
  const r=evaluateAbstractCmsState(s,ids,{finalVerifierAccepted:true});
  assert.equal(r.abstract_candidate_state_bit,0);
  assert.equal(r.terminal_coverage_on_this_trace,false);
  assert.equal(r.pq128_demonstrated,false);
});
test('a rejecting transcript does not need a witness or a bad event',()=>{
  const r=evaluateAbstractCmsState(s,ids,{finalVerifierAccepted:false});
  assert.equal(r.terminal_coverage_on_this_trace,true);
});
test('future challenge cannot affect earlier prefixes and prover step does not flip',()=>{
  const i=ids.indexOf('fri_fold_challenge_1');
  const before=evaluateAbstractCmsState(s,ids.slice(0,i),{
    exceptionalChallengeAt:['fri_fold_challenge_1'],
  });
  const after=evaluateAbstractCmsState(s,ids.slice(0,i+1),{
    exceptionalChallengeAt:['fri_fold_challenge_1'],
  });
  assert.equal(before.abstract_candidate_state_bit,0);
  assert.equal(after.abstract_candidate_state_bit,1);
  assert.equal(after.prover_move_axiom_holds_for_this_trace,true);
});
test('rejects unauthorized predicates and duplicate challenge identities',()=>{
  assert.throws(()=>evaluateAbstractCmsState(s,ids,{preChallengeWitnessAvailableAt:['main_commitment']}));
  assert.throws(()=>evaluateAbstractCmsState(s,ids,{exceptionalChallengeAt:['lookup_alpha','lookup_alpha']}));
  assert.throws(()=>evaluateAbstractCmsState(s,ids,{finalVerifierAccepted:'yes'}));
});
