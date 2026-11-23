// Research-only: instantiate the exact p3-security 0.8.0 LogUp
// fingerprint error N*(W+2)/|E| and show what would happen IF an
// independently proved QROM reduction carried Q^c multiplicative loss.
// No value of c is justified for the current HidingFriPcs/LogUp code.
// Only interactive fixed-commitment error is established here.
// Source: Plonky3/Plonky3 v0.8.0 security/src/logup.rs.
const P=2013265921n;
const nLog2=(n)=>n===0n?0:(n-1n).toString(2).length;
const bounded=(name,value,low,high)=>{
  if(!Number.isSafeInteger(value)||value<low||value>high)
    throw new RangeError(name+' out of profile');
  return value;
};

export function assessLogupQromReduction({
  logTrace=23,
  challengeDegree=8,
  interactionColumnsPerRow=4,
  messageWidth=2,
  queries=1n<<128n,
  receipts=1n<<32n,
  segments=64,
  eventFamilies=4,
}={}){
  bounded('logTrace',logTrace,12,23);
  bounded('challengeDegree',challengeDegree,1,32);
  bounded('interactionColumnsPerRow',interactionColumnsPerRow,1,32);
  bounded('messageWidth',messageWidth,1,32);
  bounded('segments',segments,1,64);
  bounded('eventFamilies',eventFamilies,1,64);
  if(typeof queries!=='bigint'||queries<1n||queries>(1n<<256n)||
    typeof receipts!=='bigint'||receipts<1n||receipts>(1n<<64n))
    throw new RangeError('queries/receipts invalid');
  const E=P**BigInt(challengeDegree);
  const rows=1n<<BigInt(logTrace);
  // Each row emits 3 gate-side reads plus 1 wire-table entry,
  // irrespective of whether a gate is inactive. This conservative
  // count matches p3-security::logup::fingerprint_error (0.8.0).
  const N=rows*BigInt(interactionColumnsPerRow);
  const numerator=N*BigInt(messageWidth+2);
  const events=receipts*BigInt(segments)*BigInt(eventFamilies);
  const linear=events*queries*numerator;
  const quadratic=events*queries*queries*numerator;
  // These are NOT security certificates: they are implication checks
  // of TWO UNPROVED transfer hypotheses with unit leading constants.
  const outcomes=[1,2].map(lossExponent=>{
    const n=lossExponent===1?linear:quadratic;
    return Object.freeze({
      hypothesized_quantum_loss_Q_exponent:lossExponent,
      hypothetical_loss_constant_assumed_one:true,
      upper_bound_if_hypotheses_hold:{
        numerator:n.toString(),denominator:E.toString(),
      },
      sufficient_for_g1_half_probability_if_applicable:2n*n<=E,
      sufficient_for_g2_residual_2_minus_128_if_applicable:
        (n<<128n)<=E,
      required_extension_degree_for_g1_at_this_fixed_shape:
        (()=>{
          let d=1;while(2n*n>=P**BigInt(d))d++;
          return d;
        })(),
    });
  });
  return Object.freeze({
    schema:'AEGIS_V4_LOGUP_QROM_REDUCTION_BRANCHES_V1',
    source:'Plonky3 v0.8.0 p3-security::logup::fingerprint_error',
    field_modulus:P.toString(),
    extension_degree:challengeDegree,extension_field_size:E.toString(),
    rows:rows.toString(),interaction_fractions_per_row:interactionColumnsPerRow,
    max_message_width:messageWidth,
    base_interactive_fingerprint:{
      numerator:numerator.toString(),denominator:E.toString(),
    },
    composition_events_if_valid:events.toString(),
    branches:outcomes,
    measured_fri_financial_rbr_bits:null,
    valid_uniform_adaptive_first_bad_event_reduction:false,
    quantum_compiler_applicability_proved:false,
    qrom_query_loss_exponent_proved:null,
    qrom_query_loss_constant_proved:null,
    round_by_round_logup_fri_composition_proved:false,
    challenge_sampling_independence_proved:false,
    full_program_financial_receipt_proved:false,
    pq128_demonstrated:false,
    production_ready:false,
    verdict:'BLOCKED_ON_QROM_THEOREM_AND_ACTUAL_WIRED_AIR_FRI_RBR',
  });
}
