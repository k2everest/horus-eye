// Read-only structural validator for the real Rust audit-verify-wired
// transcript JSON. A report is NOT a trusted binary attestation, a quantum
// extractor, or a PQ128 certificate, even if all checks pass.
import {deriveWiredScheduleFromNativeReport} from './native-wired-schedule.mjs';
const assert=(test,reason)=>{if(!test)throw new Error('NATIVE_AUDIT_'+reason);};
const exactInt=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const hex=s=>typeof s==='string'&&/^[0-9a-f]{128}$/.test(s);
const freeze=Object.freeze;
export function validateNativeWiredVerifierAudit(audit,geometryReport,{
  expectedProgramSha512,
}={}){
  assert(audit?.schema==='AEGIS_NATIVE_WIRED_VERIFY_BATCH_OBSERVATION_V1',
    'SCHEMA');
  assert(hex(expectedProgramSha512)&&audit.program_sha512===expectedProgramSha512&&
    hex(audit.proof_sha512),'PROGRAM_OR_PROOF_DIGEST');
  assert(audit.verified_by_original_config===true&&
    audit.verified_by_instrumented_config===true,'VERIFIER_ATTESTATION_FIELD');
  const m=deriveWiredScheduleFromNativeReport(geometryReport,{
    expectedProgramSha512,
  });
  const f=audit.fri;
  assert(f?.query_samples_source==='actual verifier challenger sample_bits'&&
    f.projection_extracted_inside_upstream_verifier===false,'SOURCE_DECLARATIONS');
  assert(f.fold_count===m.fri_round_count&&
    f.initial_lde_rows===m.declared_initial_lde_rows&&
    f.final_domain_rows===m.matched_geometry.fri.final_evaluation_rows&&
    f.query_index_bits===Math.log2(f.initial_lde_rows)&&
    Array.isArray(f.log_arities)&&f.log_arities.length===f.fold_count&&
    f.log_arities.every(n=>n===1),'FRI_SHAPE');
  const events=audit.transcript_events;
  assert(Array.isArray(events)&&events.length<150000&&events.length>0&&
    events.every((e,i)=>e&&e.seq===i&&
      ['observe','sample_base','sample_extension','sample_bits','grind'].includes(e.operation)),
      'MALFORMED_EVENTS');
  const sampled=events.filter(e=>e.operation==='sample_bits');
  const bits=sampled.map(e=>{
    assert(e.bits===f.query_index_bits&&
      typeof e.value==='string'&&/^\d+$/.test(e.value),
      'SAMPLE_BITS_WIDTH');
    const n=Number(e.value);
    assert(exactInt(n,0,f.initial_lde_rows-1),'SAMPLE_BITS_RANGE');
    return n;
  });
  assert(bits.length===geometryReport.fri_queries&&
    bits.length===f.queries?.length&&
    bits.every((n,i)=>n===f.queries[i]),'SAMPLED_QUERIES_DIFFER');
  const expectedPath=bits.map(index=>{
    const out=[];
    for(let i=0;i<f.fold_count;i++){
      index>>=1;
      out.push(index);
    }
    return out;
  });
  assert(Array.isArray(f.fold_query_indices_after_each_round)&&
    f.fold_query_indices_after_each_round.length===bits.length&&
    expectedPath.every((path,i)=>{
      const observed=f.fold_query_indices_after_each_round[i];
      return Array.isArray(observed)&&observed.length===path.length&&
        path.every((v,j)=>observed[j]===v);
    }),'FRI_QUERY_PROJECTION');
  assert(audit.batching?.exact_batch_denominator_polynomials_exported===false&&
    audit.whole_verifier_byte_transcript_equivalence_proved===false&&
    audit.quantum_vector_commitment_extraction_proved===false&&
    audit.cms_round_by_round_knowledge_proved===false&&
    audit.pq128_demonstrated===false&&audit.production_ready===false,'FALSE_CLAIM');
  return freeze({schema:'AEGIS_NATIVE_WIRED_VERIFIER_AUDIT_VALIDATION_V1',
    structural_consistency_checked:true,
    query_count:bits.length,
    source_observed_query_width:f.query_index_bits,
    fold_count:f.fold_count,
    runtime_report_matches_research_geometry:true,
    transcript_drift_detected:false,
    trusted_executable_attested:false,
    exact_batching_polynomials_verified:false,
    all_challenges_semantically_labeled:false,
    actual_upstream_fri_query_map_instrumented:false,
    quantum_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false});
}
