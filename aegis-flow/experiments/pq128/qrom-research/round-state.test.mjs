import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wiredRoundSchedule,validateWiredTranscriptPrefix,validateMaskedWiredTranscript,checkCandidateStateTrace,
} from './round-state.mjs';

const make=()=>wiredRoundSchedule({friLogArities:[1,1,1],friQueries:320});
const ids=s=>s.steps.map(x=>x.id);

test('enumerates all actual batch, PCS and FRI message sites in the pinned source order',()=>{
  const s=make(),a=ids(s);
  const before=(l,r)=>assert.ok(a.indexOf(l)<a.indexOf(r),l+' precedes '+r);
  for(const [l,r] of [
    ['main_commitment','preprocessed_commitment'],
    ['preprocessed_commitment','lookup_alpha'],
    ['lookup_alpha','lookup_beta'],
    ['lookup_beta','permutation_commitment'],
    ['permutation_commitment','lookup_terminal_0'],
    ['lookup_terminal_0','constraint_challenge'],
    ['constraint_challenge','quotient_commitment'],
    ['quotient_commitment','randomization_commitment'],
    ['randomization_commitment','zeta'],
    ['zeta','pcs_claimed_evaluations'],
    ['pcs_claimed_evaluations','pcs_batch_alpha'],
    ['pcs_batch_alpha','fri_commitment_0'],
    ['fri_commitment_0','fri_fold_challenge_0'],
    ['fri_fold_challenge_2','fri_final_poly'],
    ['fri_final_poly','fri_query_indices'],
    ['fri_query_indices','fri_openings'],
    ['fri_openings','terminal_verification'],
  ])before(l,r);
  assert.equal(s.verifier_challenges.filter(x=>x.startsWith('fri_fold')).length,3);
  assert.equal(s.fri_schedule_proven_from_verifier,false);
  assert.equal(s.round_by_round_knowledge_proved,false);
});
test('no prover or verifier input may reorder the symbolic transcript',()=>{
  const s=make(),a=ids(s);
  assert.equal(validateWiredTranscriptPrefix(s,[]).next_id,a[0]);
  assert.equal(validateWiredTranscriptPrefix(s,a).structurally_complete,true);
  assert.throws(()=>validateWiredTranscriptPrefix(s,[a[1]]),/NONCANONICAL/);
  assert.throws(()=>validateWiredTranscriptPrefix(s,[...a,'extra']));
  assert.equal(validateWiredTranscriptPrefix(s,a).cms_state_bit,null);
});
test('zero-PoW sites remain explicit, but positive FRI and PCS PoW are conditional',()=>{
  const a=ids(make());
  assert.ok(a.includes('lookup_pow'));assert.ok(a.includes('ood_pow'));
  assert.ok(!a.includes('pcs_batch_pow'));
  assert.ok(!a.includes('fri_query_pow'));
  const b=ids(wiredRoundSchedule({friLogArities:[2,1],
    pcsBatchPowBits:2,friCommitPowBits:1,friQueryPowBits:3}));
  assert.ok(b.includes('pcs_batch_pow'));
  assert.ok(b.includes('fri_commit_pow_1'));
  assert.ok(b.includes('fri_query_pow'));
  assert.equal(b.includes('fri_commitment_2'),false);
});
test('refuses unsupported shapes and does not infer verifier-derived FRI schedule',()=>{
  assert.throws(()=>wiredRoundSchedule({friLogArities:[]}));
  assert.throws(()=>wiredRoundSchedule({friLogArities:[0,1]}));
  assert.throws(()=>wiredRoundSchedule({friLogArities:[1],hiding:false}));
  assert.throws(()=>wiredRoundSchedule({friLogArities:[1],lookupInstances:2}));
  assert.throws(()=>wiredRoundSchedule({friLogArities:[1],friQueries:0}));
  assert.throws(()=>wiredRoundSchedule({friLogArities:[1],friLogArities2:4,lookupPowBits:-1}));
});
test('a prover transition from 0 to 1 is prohibited by the CMS local axiom',()=>{
  const s=make(),a=ids(s);
  const fake=[0,...Array(a.length).fill(0)];
  fake[1]=1;
  const r=checkCandidateStateTrace(s,a,fake);
  assert.equal(r.prover_move_axiom,false);
  assert.equal(r.local_trace_axioms_pass,false);
  assert.equal(r.theorem_8_6_applicable,false);
});
test('a verifier transition is structurally allowed but gives no PoK theorem',()=>{
  const s=make(),a=ids(s),first=a.indexOf('lookup_alpha');
  const states=a.map((_,i)=>Number(i>first));
  states.unshift(0);
  const r=checkCandidateStateTrace(s,a,states,{accepted:true});
  assert.equal(r.empty_axiom,true);
  assert.equal(r.prover_move_axiom,true);
  assert.equal(r.terminal_axiom_on_supplied_trace,true);
  assert.equal(r.financial_extraction_proved,false);
  assert.equal(r.universal_quantification_proved,false);
});
test('accepting terminal prefix still at state 0 violates terminal axiom',()=>{
  const s=make(),a=ids(s),states=Array(a.length+1).fill(0);
  const r=checkCandidateStateTrace(s,a,states,{accepted:true});
  assert.equal(r.terminal_axiom_on_supplied_trace,false);
  assert.equal(r.local_trace_axioms_pass,false);
});
test('rejecting terminal prefix at state 0 is allowed only for this supplied trace',()=>{
  const s=make(),a=ids(s),states=Array(a.length+1).fill(0);
  const r=checkCandidateStateTrace(s,a,states,{accepted:false});
  assert.equal(r.local_trace_axioms_pass,true);
  assert.equal(r.universal_quantification_proved,false);
});

test('strong RBR holes can mark verifier challenges only, never prover messages',()=>{
  const s=make(),a=ids(s),masked=[...a];
  masked[masked.indexOf('lookup_alpha')]=null;
  masked[masked.indexOf('fri_fold_challenge_0')]=null;
  const audit=validateMaskedWiredTranscript(s,masked);
  assert.deepEqual(audit.verifier_bottom_holes,['lookup_alpha','fri_fold_challenge_0']);
  assert.equal(audit.strong_rbr_state_invariance_proved,false);
  masked[0]=null;
  assert.throws(()=>validateMaskedWiredTranscript(s,masked),/BOTTOM_ONLY/);
  masked[0]=a[0];
  masked[1]='forged';
  assert.throws(()=>validateMaskedWiredTranscript(s,masked),/NONCANONICAL/);
});
