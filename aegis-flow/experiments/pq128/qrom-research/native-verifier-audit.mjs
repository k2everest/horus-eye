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
  // ExtensionFieldCodec samples eight BabyBear coefficients for every
  // named verifier challenge. No challenge may be fabricated after queries.
  const labels=['lookup_alpha','lookup_beta','constraint_challenge',
    'zeta','pcs_batch_alpha',
    ...Array.from({length:f.fold_count},(_,i)=>'fri_fold_challenge_'+i)];
  const base=events.filter(e=>e.operation==='sample_base');
  assert(base.length===labels.length*8&&
    events.every(e=>e.operation!=='sample_extension')&&
    typeof audit.named_verifier_challenges==='object'&&
    audit.named_verifier_challenges!==null&&
    Object.keys(audit.named_verifier_challenges).length===labels.length,
    'CHALLENGE_COUNT');
  for(let i=0;i<labels.length;i++){
    const challenge=audit.named_verifier_challenges[labels[i]];
    assert(challenge?.basis_dimension===8&&
      Array.isArray(challenge.babybear_coefficients)&&
      challenge.babybear_coefficients.length===8,'CHALLENGE_BASIS_SHAPE');
    for(let j=0;j<8;j++){
      const observed=base[i*8+j].value,claimed=challenge.babybear_coefficients[j];
      assert(typeof observed==='string'&&/^\d+$/.test(observed)&&
        exactInt(claimed,0,2013265920)&&observed===String(claimed),
        'CHALLENGE_BASIS_MISMATCH');
    }
  }
  const firstQuery=events.findIndex(e=>e.operation==='sample_bits');
  const lastChallenge=events.findLastIndex(e=>e.operation==='sample_base');
  assert(lastChallenge<firstQuery&&firstQuery>=0,'CHALLENGE_QUERY_ORDER');
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
  const typed=audit.typed_replay;
  assert(typed?.schema==='AEGIS_VERIFIER_TYPED_TRANSCRIPT_REPLAY_V1'&&
    typed.native_transcript_bytes_and_samples_consistent===true,
    'TYPED_REPLAY_MISSING');
  assert(typed.fri_query_indices?.length===bits.length&&
    typed.fri_query_indices.every((n,i)=>n===bits[i])&&
    Array.isArray(typed.fri_derived_log_arities)&&
    typed.fri_derived_log_arities.length===f.fold_count&&
    typed.fri_derived_log_arities.every(n=>n===1)&&
    typed.fri_index_bits===f.query_index_bits,
    'TYPED_FRI_SHAPE');
  const challengePairs=[
    ['constraint_challenge','rho_basis'],
    ['zeta','zeta_basis'],
    ['pcs_batch_alpha','pcs_batch_gamma_basis'],
  ];
  for(const [named,key] of challengePairs){
    assert(Array.isArray(typed[key])&&typed[key].length===8&&
      typed[key].every((n,i)=>n===
        audit.named_verifier_challenges[named].babybear_coefficients[i]),
      'TYPED_CHALLENGE_MISMATCH');
  }
  assert(Array.isArray(typed.fri_fold_beta_bases)&&
    typed.fri_fold_beta_bases.length===f.fold_count&&
    typed.fri_fold_beta_bases.every((coeffs,i)=>
      Array.isArray(coeffs)&&coeffs.length===8&&
      coeffs.every((n,j)=>n===audit.named_verifier_challenges[
        'fri_fold_challenge_'+i].babybear_coefficients[j])),
      'TYPED_FOLD_CHALLENGE_MISMATCH');
  assert(Array.isArray(typed.batch_polynomial_terms)&&
    typed.batch_polynomial_terms.length>0&&
    typed.batch_polynomial_terms.every(term=>
      exactInt(term.commitment_index,0,100)&&
      exactInt(term.matrix_index,0,100)&&
      exactInt(term.opening_index,0,100)&&
      exactInt(term.input_log_height,1,27)&&
      exactInt(term.alpha_ladder_offset,0,1_000_000)&&
      exactInt(term.polynomial_count,1,1_000_000)&&
      [0,8].includes(term.hiding_random_codewords)&&
      Array.isArray(term.point_basis)&&term.point_basis.length===8),
      'TYPED_BATCHING_TERMS');
  // A separate gamma-power ladder is maintained at each LDE height.
  // This is the native FRI batching order, checked against the actual
  // typed replay. A forged short ladder would inflate algebraic security.
  const ladders=new Map();
  for(const term of typed.batch_polynomial_terms){
    const h=term.input_log_height;
    const expected=ladders.get(h)??0;
    assert(term.alpha_ladder_offset===expected,'PCS_GAMMA_LADDER_GAP');
    assert(Number.isSafeInteger(expected+term.polynomial_count),
      'PCS_GAMMA_LADDER_OVERFLOW');
    ladders.set(h,expected+term.polynomial_count);
  }
  const recorded=typed.batch_ladder_lengths_by_height;
  assert(recorded!==null&&typeof recorded==='object'&&
    !Array.isArray(recorded)&&
    Object.keys(recorded).length===ladders.size&&
    [...ladders].every(([h,length])=>recorded[String(h)]===length),
    'PCS_GAMMA_LADDER_REPORT');
  // Only for a FIXED nonzero polynomial in gamma, Schwartz-Zippel:
  // P_h(gamma) has degree <= L_h-1, so Pr[P_h(gamma)=0]
  // <= (L_h-1)/|F_p^8|. A conservative union over heights is valid
  // only if all discrepancies are fixed BEFORE sampling gamma and at
  // least one induced error polynomial is nonzero.
  // This calculation is not a quantum/knowledge/commitment proof.
  const conditionalRoots=[...ladders.values()].reduce(
    (sum,length)=>sum+Math.max(0,length-1),0);
  assert(Number.isSafeInteger(conditionalRoots),
    'PCS_GAMMA_ROOT_BUDGET_OVERFLOW');
  // Validate every exported denominator in F_p^8 by subtraction of
  // the verifier-derived base-field query point X from the opening point z.
  // This is arithmetic/shape checking, not an independent hash replay.
  const prime=2013265921,denoms=typed.actual_pcs_query_denominator_evaluations;
  const terms=typed.batch_polynomial_terms;
  assert(typed.denominator_evaluations_exported===true&&
    typed.denominator_evaluations_came_from_upstream_verifier_hook===false&&
    Array.isArray(denoms)&&denoms.length===bits.length*terms.length&&
    denoms.length<=200000,'DENOMINATOR_COUNT');
  let d=0;
  const reverseBits=(v,width)=>{
    let reversed=0;
    for(let j=0;j<width;j++){
      reversed=(reversed<<1)|(v&1);
      v>>=1;
    }
    return reversed;
  };
  for(let qi=0;qi<bits.length;qi++){
    for(const term of terms){
      const rec=denoms[d++];
      const h=term.input_log_height;
      const shifted=bits[qi]>>(f.query_index_bits-h);
      const rev=reverseBits(shifted,h);
      assert(rec?.query===qi&&rec.query_index===bits[qi]&&
        rec.commitment_index===term.commitment_index&&
        rec.matrix_index===term.matrix_index&&
        rec.opening_index===term.opening_index&&
        rec.log_height===h&&rec.reduced_index===shifted&&
        rec.bit_reversed_index===rev&&
        exactInt(rec.query_x_canonical,0,prime-1)&&
        Array.isArray(rec.z_basis)&&rec.z_basis.length===8&&
        Array.isArray(rec.denominator_basis)&&rec.denominator_basis.length===8,
        'DENOMINATOR_ORDER_AND_PROJECTION');
      const expected=rec.z_basis.map((v,i)=>{
        assert(exactInt(v,0,prime-1),'NONCANONICAL_OPENING_POINT');
        return i===0?(v-rec.query_x_canonical+prime)%prime:v;
      });
      assert(expected.every((v,i)=>rec.denominator_basis[i]===v)&&
        rec.denominator_basis.some(v=>v!==0),
        'DENOMINATOR_FIELD_ARITHMETIC');
    }
  }
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
    conditional_fixed_oracle_gamma_root_numerator:String(conditionalRoots),
    conditional_fixed_oracle_gamma_root_denominator:
      String(2013265921n**8n),
    fixed_pre_gamma_discrepancy_hypothesis_proved:false,
    trusted_executable_attested:false,
    exact_batching_polynomials_verified:false,
    all_challenges_semantically_labeled:false,
    actual_upstream_fri_query_map_instrumented:false,
    quantum_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false});
}
