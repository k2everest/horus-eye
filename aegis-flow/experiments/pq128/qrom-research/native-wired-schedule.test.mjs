import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveHidingDegreeProfile} from './hiding-degree-profile.mjs';
import {deriveWiredScheduleFromNativeReport} from './native-wired-schedule.mjs';
import {validateWiredTranscriptPrefix} from './round-state.mjs';

const digest='ab'.repeat(64);
const makeReport=({rows=4096,degree=3,weight=4,constraints=20}={})=>{
  const p=deriveHidingDegreeProfile({traceRows:rows,symbolicConstraintDegree:degree,
    constraintFullSelectorDegree:weight,airConstraintComponents:constraints});
  const g=p.committed_degree_geometry;
  return {
    schema:'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1',
    program_sha512:digest,trace_rows:rows,constraint_degree:degree,
    constraint_full_selector_degree:weight,constraints,
    hiding_fri:true,fri_blowup:8,fri_queries:320,num_lookups:1,
    num_batched_functions:12,
    logup_field_bits_floor:247,plonky3_field16_implemented:false,
    pq128_demonstrated:false,production_ready:false,
    num_quotient_chunks:g.quotient_chunks,
    committed_degree_geometry:{...g,committed_log_degree:Math.log2(2*rows),
      initial_fri_lde_height:p.fri.initial_lde_rows,
      terminal_evaluation_vector_height:p.fri.final_evaluation_rows,
      terminal_polynomial_degree_strict_bound:1,
      fri_rounds:p.fri.rounds.map(r=>({
        round:r.index,commit_before_fold:true,
        evaluation_vector_height:r.input_evaluation_rows,
        committed_matrix_height:r.merkle_leaf_rows,
        matrix_width_extension_values:2,
        verifier_degree_strict_bound:r.fri_advertised_degree_exclusive,
        honest_opening_quotient_degree_strict_bound:r.honest_reduced_degree_exclusive,
        fold_arity:2,
      }))},
  };
};

test('derives 13 canonical CMS folding rounds from checked 4096-row native geometry',()=>{
  const r=deriveWiredScheduleFromNativeReport(makeReport(),
    {expectedProgramSha512:digest});
  assert.equal(r.fri_round_count,13);
  assert.equal(r.declared_initial_lde_rows,65536);
  assert.equal(r.declared_terminal_degree_exclusive,1);
  assert.equal(r.schedule.parameters.friLogArities.length,13);
  assert.ok(r.schedule.parameters.friLogArities.every(n=>n===1));
  assert.equal(r.schedule.verifier_challenges.filter(
    x=>x.startsWith('fri_fold_challenge_')).length,13);
  const ids=r.schedule.steps.map(x=>x.id);
  assert.ok(ids.indexOf('fri_commitment_12')<ids.indexOf('fri_final_poly'));
  assert.ok(ids.indexOf('fri_final_poly')<ids.indexOf('fri_query_indices'));
  assert.ok(ids.indexOf('fri_query_indices')<ids.indexOf('fri_openings'));
  assert.equal(validateWiredTranscriptPrefix(r.schedule,ids).structurally_complete,true);
  assert.equal(r.derived_from_report_not_prover_arity,true);
  assert.equal(r.native_build_attested,false);
  assert.equal(r.cms_terminal_covering_executable_proved,false);
  assert.equal(r.pq128_demonstrated,false);
});

test('larger authenticated configuration induces longer FRI transcript',()=>{
  const r=deriveWiredScheduleFromNativeReport(makeReport({rows:8192}),
    {expectedProgramSha512:digest});
  assert.equal(r.fri_round_count,14);
  assert.equal(r.declared_initial_lde_rows,131072);
});

test('never trusts mismatched report digest, forged arity, omitted round or altered degree',()=>{
  const mutations=[
    r=>{r.program_sha512='ff'.repeat(64);},
    r=>{r.num_lookups=2;},
    r=>{r.num_batched_functions=0;},
    r=>{r.committed_degree_geometry.fri_rounds[4].fold_arity=4;},
    r=>{r.committed_degree_geometry.fri_rounds.pop();},
    r=>{r.committed_degree_geometry.fri_rounds[3].committed_matrix_height++;},
    r=>{r.committed_degree_geometry.fri_rounds.reverse();},
    r=>{r.committed_degree_geometry.quotient_recomposed_general_degree_exclusive=
      r.committed_degree_geometry.quotient_recomposed_honest_degree_exclusive;},
    r=>{r.fri_queries=1;},
    r=>{r.production_ready=true;},
  ];
  for(const mutate of mutations){
    const report=makeReport();mutate(report);
    assert.throws(()=>deriveWiredScheduleFromNativeReport(report,
      {expectedProgramSha512:digest}));
  }
  assert.throws(()=>deriveWiredScheduleFromNativeReport(makeReport(),
    {expectedProgramSha512:'cd'.repeat(64)}),/DIGEST/);
  assert.throws(()=>deriveWiredScheduleFromNativeReport(makeReport()));
});
