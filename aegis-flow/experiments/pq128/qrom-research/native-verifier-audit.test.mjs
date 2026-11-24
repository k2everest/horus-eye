import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveHidingDegreeProfile} from './hiding-degree-profile.mjs';
import {validateNativeWiredVerifierAudit} from './native-verifier-audit.mjs';
const digest='ab'.repeat(64);
const report=()=>{
  const p=deriveHidingDegreeProfile({traceRows:4096,
    symbolicConstraintDegree:3,constraintFullSelectorDegree:4,
    airConstraintComponents:20});
  return {
    schema:'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1',
    program_sha512:digest,trace_rows:4096,constraint_degree:3,
    constraint_full_selector_degree:4,constraints:20,
    hiding_fri:true,fri_blowup:8,fri_queries:320,num_lookups:1,
    num_batched_functions:12,logup_field_bits_floor:247,
    plonky3_field16_implemented:false,pq128_demonstrated:false,
    production_ready:false,num_quotient_chunks:8,
    committed_degree_geometry:{...p.committed_degree_geometry,
      committed_log_degree:13,
      initial_fri_lde_height:65536,terminal_evaluation_vector_height:8,
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
const audit=()=>{
  const indices=Array.from({length:320},(_,i)=>(i*197+31)%65536);
  const path=indices.map(index=>Array.from({length:13},()=>{
    index>>=1;return index;
  }));
  const labels=['lookup_alpha','lookup_beta','constraint_challenge',
    'zeta','pcs_batch_alpha',
    ...Array.from({length:13},(_,i)=>'fri_fold_challenge_'+i)];
  const named=Object.fromEntries(labels.map((name,i)=>[name,{
    basis_dimension:8,
    babybear_coefficients:Array.from({length:8},(_,j)=>i*8+j+1)
  }]));
  const base=labels.flatMap((_,i)=>Array.from({length:8},(_,j)=>({
    operation:'sample_base',type_name:'BabyBear',
    value:String(i*8+j+1),bits:null,
  })));
  return {
    schema:'AEGIS_NATIVE_WIRED_VERIFY_BATCH_OBSERVATION_V1',
    program_sha512:digest,proof_sha512:'ef'.repeat(64),
    verified_by_original_config:true,verified_by_instrumented_config:true,
    transcript_events:[...base,...indices.map(i=>({operation:'sample_bits',
      type_name:'usize',value:String(i),bits:16}))].map((e,seq)=>({...e,seq})),
    named_verifier_challenges:named,
    typed_replay:{
      schema:'AEGIS_VERIFIER_TYPED_TRANSCRIPT_REPLAY_V1',
      native_transcript_bytes_and_samples_consistent:true,
      fri_query_indices:indices,
      fri_derived_log_arities:Array(13).fill(1),
      fri_index_bits:16,
      rho_basis:named.constraint_challenge.babybear_coefficients,
      zeta_basis:named.zeta.babybear_coefficients,
      pcs_batch_gamma_basis:named.pcs_batch_alpha.babybear_coefficients,
      fri_fold_beta_bases:Array.from({length:13},(_,i)=>
        named['fri_fold_challenge_'+i].babybear_coefficients),
      batch_polynomial_terms:[{commitment_index:0,matrix_index:0,
        opening_index:0,input_log_height:16,alpha_ladder_offset:0,
        polynomial_count:12,hiding_random_codewords:8,
        point_basis:[11,...Array(7).fill(0)]}],
      denominator_evaluations_exported:true,
      denominator_evaluations_came_from_upstream_verifier_hook:false,
      actual_pcs_query_denominator_evaluations:indices.map((index,query)=>{
        let v=index,reversed=0;
        for(let j=0;j<16;j++){reversed=(reversed<<1)|(v&1);v>>=1;}
        return {query,query_index:index,commitment_index:0,
          matrix_index:0,opening_index:0,log_height:16,
          reduced_index:index,bit_reversed_index:reversed,
          query_x_canonical:7,z_basis:[11,...Array(7).fill(0)],
          denominator_basis:[4,...Array(7).fill(0)]};
      }),
    },
    fri:{
      query_samples_source:'actual verifier challenger sample_bits',
      projection_extracted_inside_upstream_verifier:false,
      query_index_bits:16,queries:indices,
      fold_query_indices_after_each_round:path,
      fold_count:13,log_arities:Array(13).fill(1),
      initial_lde_rows:65536,final_domain_rows:8,
    },
    batching:{exact_batch_denominator_polynomials_exported:false},
    whole_verifier_byte_transcript_equivalence_proved:false,
    quantum_vector_commitment_extraction_proved:false,
    cms_round_by_round_knowledge_proved:false,
    pq128_demonstrated:false,production_ready:false,
  };
};
test('real-verifier JSON schema has fail-closed query/geometry validation',()=>{
  const r=validateNativeWiredVerifierAudit(audit(),report(),
    {expectedProgramSha512:digest});
  assert.equal(r.query_count,320);
  assert.equal(r.fold_count,13);
  assert.equal(r.structural_consistency_checked,true);
  assert.equal(r.trusted_executable_attested,false);
  assert.equal(r.quantum_extraction_proved,false);
});
test('sampled indices must match observed sample_bits, not a reported substitute',()=>{
  const forged=audit();forged.fri.queries[15]^=1;
  assert.throws(()=>validateNativeWiredVerifierAudit(forged,report(),
    {expectedProgramSha512:digest}),/SAMPLED_QUERIES_DIFFER/);
  const out=audit();out.transcript_events.pop();
  assert.throws(()=>validateNativeWiredVerifierAudit(out,report(),
    {expectedProgramSha512:digest}),/SAMPLED_QUERIES_DIFFER/);
  const wide=audit();wide.transcript_events.find(e=>e.operation==='sample_bits').bits=15;
  assert.throws(()=>validateNativeWiredVerifierAudit(wide,report(),
    {expectedProgramSha512:digest}),/SAMPLE_BITS_WIDTH/);
});
test('FRI parent positions derive from actual draw, not attacker-supplied projection',()=>{
  const a=audit();a.fri.fold_query_indices_after_each_round[0][3]++;
  assert.throws(()=>validateNativeWiredVerifierAudit(a,report(),
    {expectedProgramSha512:digest}),/FRI_QUERY_PROJECTION/);
});
test('reject false attestations and adversarial changes in geometry',()=>{
  for(const change of [
    a=>a.pq128_demonstrated=true,
    a=>a.batching.exact_batch_denominator_polynomials_exported=true,
    a=>a.fri.fold_count=12,
    a=>a.proof_sha512='GG',
    a=>a.transcript_events[0].seq=5,
    a=>a.fri.final_domain_rows=16,
    a=>a.named_verifier_challenges.lookup_alpha.babybear_coefficients[0]++,
    a=>a.typed_replay.pcs_batch_gamma_basis[0]++,
    a=>a.typed_replay.fri_query_indices[0]++,
    a=>a.typed_replay.batch_polynomial_terms[0].hiding_random_codewords=7,
    a=>a.typed_replay.actual_pcs_query_denominator_evaluations[0]
      .denominator_basis[0]++,
    a=>a.typed_replay.actual_pcs_query_denominator_evaluations[2]
      .bit_reversed_index++,
  ]){
    const a=audit();change(a);
    assert.throws(()=>validateNativeWiredVerifierAudit(a,report(),
      {expectedProgramSha512:digest}));
  }
  const bad=report();bad.committed_degree_geometry.fri_rounds[0].fold_arity=4;
  assert.throws(()=>validateNativeWiredVerifierAudit(audit(),bad,
    {expectedProgramSha512:digest}));
});
