// Source-linked degree accounting for the SINGLE-instance, two-adic WiredAir
// configuration. Exclusive bounds mean deg(f) < bound. No polynomial oracle
// is extracted here: malicious-commitment bounds remain conditional on PCS/FRI.
import {conditionalAliOodBudget} from './ali-ood-degree-budget.mjs';
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const powerOfTwo=n=>integer(n,1,2**27)&&Number.isInteger(Math.log2(n));
const freeze=Object.freeze;
const keys=['traceRows','symbolicConstraintDegree','constraintFullSelectorDegree','airConstraintComponents'];

export function deriveHidingDegreeProfile(options){
  if(!options||typeof options!=='object'||Array.isArray(options)||
    Object.keys(options).some(k=>!keys.includes(k)))throw new TypeError('UNSUPPORTED_DEGREE_PROFILE');
  const {traceRows:n,symbolicConstraintDegree:d,constraintFullSelectorDegree:w,airConstraintComponents:m}=options;
  if(!powerOfTwo(n)||n<4096||n>2**23||!integer(d,2,64)||!integer(w,d,128)||!integer(m,1,50_000_000))
    throw new TypeError('UNSUPPORTED_DEGREE_PROFILE');
  // batch-stark symbolic.rs: ceil_log2((degree + is_zk).max(2)-1).
  // prover.rs then adds is_zk AGAIN to the exponent for the actual chunks.
  const logQuotientExpansion=Math.ceil(Math.log2(d)),chunks=2**(logQuotientExpansion+1);
  const committed=2*n,quotientDomain=n*chunks,lde=committed*8;
  if(quotientDomain>2**27||lde>2**27)throw new RangeError('BABYBEAR_DOMAIN_EXCEEDED');
  const rounds=[];let height=lde,bound=committed,honestBound=committed-1;
  while(bound>1){
    rounds.push(freeze({index:rounds.length,log_arity:1,
      input_evaluation_rows:height,merkle_leaf_rows:height/2,merkle_leaf_width:2,
      fri_advertised_degree_exclusive:bound,honest_reduced_degree_exclusive:honestBound,
      after_fold_degree_exclusive:Math.ceil(bound/2)}));
    height/=2;bound=Math.ceil(bound/2);honestBound=Math.ceil(honestBound/2);
  }
  // L_i has degree (C-1)N. A general masked chunk has degree <2N.
  // Honest correlated masks cancel globally, but an adversarial low-degree
  // chunk family need not have that correlation. Use the GENERAL cap in OOD.
  const generalQuotient=(chunks+1)*n;
  // The upstream quotient-sizing degree assigns IsTransition weight zero.
  // For a bound in X, the separate symbolic walk assigns ALL selectors weight
  // one (their actual degree is <=2N-1). Do not silently substitute raw d.
  const constraintCap=w*(committed-1);
  const residualCap=Math.max(constraintCap,n+generalQuotient-1);
  const conditional=conditionalAliOodBudget({fieldDegree:8,traceRows:n,
    airConstraintComponents:m,constraintPolynomialDegreeCap:constraintCap,
    quotientPolynomialDegreeCap:generalQuotient-1});
  const geometry=freeze({trace_rows:n,committed_trace_rows:committed,
    log_quotient_expansion:logQuotientExpansion,quotient_chunks:chunks,
    quotient_domain_rows:quotientDomain,quotient_chunk_rows:n,
    quotient_chunk_committed_rows:committed,quotient_chunk_degree_exclusive:committed,
    quotient_recomposed_honest_degree_exclusive:quotientDomain,
    quotient_recomposed_general_degree_exclusive:generalQuotient});
  return freeze({schema:'AEGIS_HIDING_FRI_DEGREE_PROFILE_V1',
    scope:'single-WiredAir-source-derived-geometry-and-conditional-polynomial-caps',
    field:'BabyBear^8',symbolic_constraint_degree:d,constraint_full_selector_degree:w,air_constraint_components:m,
    committed_degree_geometry:geometry,
    families:freeze({main_degree_exclusive:committed,
      public_preprocessed_degree_exclusive:committed,permutation_degree_exclusive:committed,
      extra_random_codewords_degree_exclusive:committed,randomization_degree_exclusive:committed,
      quotient_base_chunk_degree_exclusive:n,quotient_mask_degree_exclusive:n,
      quotient_masked_chunk_degree_exclusive:committed}),
    ood:freeze({constraint_polynomial_degree_inclusive:constraintCap,
      quotient_recomposed_degree_inclusive:generalQuotient-1,
      residual_polynomial_degree_inclusive:residualCap,
      original_trace_vanishing_degree:n,uses_general_chunk_cap:true,
      conditional_budget:conditional}),
    fri:freeze({initial_lde_rows:lde,log_blowup:3,log_final_poly_len:0,
      max_log_arity:1,all_input_families_same_height:true,
      honest_opening_reduction_degree_exclusive:committed-1,
      verifier_initial_degree_exclusive:committed,rounds:freeze(rounds),
      final_evaluation_rows:height,final_polynomial_coefficients:1,
      final_polynomial_degree_exclusive:bound}),
    source_profile_verified:false,native_report_matched:false,
    low_degree_oracle_extraction_proved:false,malicious_mask_correlation_proved:false,
    full_FRI_soundness_proved:false,quantum_knowledge_soundness_proved:false,
    pq128_demonstrated:false,production_ready:false});
}

// A local native report is corroboration, not an adversary-supplied degree
// certificate. The CLI separately verifies the pinned implementation sources.
export function matchNativeHidingDegreeReport(report){
  if(report?.schema!=='AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1'||
    report.hiding_fri!==true||report.fri_blowup!==8||report.fri_queries!==320||
    report.logup_field_bits_floor!==247||report.plonky3_field16_implemented!==false||
    report.pq128_demonstrated!==false||report.production_ready!==false)
    throw new TypeError('UNSUPPORTED_NATIVE_DEGREE_REPORT');
  const derived=deriveHidingDegreeProfile({traceRows:report.trace_rows,
    symbolicConstraintDegree:report.constraint_degree,
    constraintFullSelectorDegree:report.constraint_full_selector_degree,airConstraintComponents:report.constraints});
  if(report.num_quotient_chunks!==derived.committed_degree_geometry.quotient_chunks)
    throw new Error('NATIVE_QUOTIENT_CHUNK_MISMATCH');
  const actual=report.committed_degree_geometry;
  if(!actual||Object.entries(derived.committed_degree_geometry).some(([key,value])=>actual[key]!==value))
    throw new Error('NATIVE_COMMITTED_DEGREE_GEOMETRY_MISMATCH');
  if(actual.committed_log_degree!==Math.log2(derived.committed_degree_geometry.committed_trace_rows))
    throw new Error('NATIVE_COMMITTED_TRACE_LENGTH_MISMATCH');
  const actualRounds=actual.fri_rounds;
  const roundFields={index:'round',input_evaluation_rows:'evaluation_vector_height',
    merkle_leaf_rows:'committed_matrix_height',fri_advertised_degree_exclusive:'verifier_degree_strict_bound',
    honest_reduced_degree_exclusive:'honest_opening_quotient_degree_strict_bound'};
  if(!Array.isArray(actualRounds)||actualRounds.length!==derived.fri.rounds.length||
    derived.fri.rounds.some((round,i)=>!actualRounds[i]||
      actualRounds[i].commit_before_fold!==true||actualRounds[i].fold_arity!==2||
      actualRounds[i].matrix_width_extension_values!==2||
      Object.entries(roundFields).some(([key,native])=>actualRounds[i][native]!==round[key]))||
    actual.initial_fri_lde_height!==derived.fri.initial_lde_rows||
    actual.terminal_evaluation_vector_height!==derived.fri.final_evaluation_rows||
    actual.terminal_polynomial_degree_strict_bound!==1)
    throw new Error('NATIVE_FRI_DEGREE_SCHEDULE_MISMATCH');
  return freeze({...derived,native_report_matched:true});
}
