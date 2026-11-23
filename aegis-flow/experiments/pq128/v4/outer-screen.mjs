// Exact hypothetical SHA-512 OUTER-binding query-model screen for candidate V4.
// Conditional result: a uniform random function [bits] in the QROM, with an
// independently proved reduction from any fake Composite to a hash collision.
// Neither premise is demonstrated for concrete SHA-512 or any STARK SDK.
import {idealCollisionBound} from '../quantitative/ideal-collision-bound.mjs';
const ceilLog2=n=>n<=1n?0:(n-1n).toString(2).length;
const integer=x=>{if(typeof x!=='bigint'||x<1n||x>(1n<<256n))throw new TypeError('bounded bigint required');return x;};
export function screenV4OuterBinding({
  receipts=1n<<32n,segmentsPerReceipt=64,oracleQueries=1n<<128n,idealHashBits=512,
  targetResidualBits=128,
}={}){
  integer(receipts);integer(oracleQueries);
  if(!Number.isSafeInteger(segmentsPerReceipt)||segmentsPerReceipt<1||segmentsPerReceipt>64||
    !Number.isSafeInteger(targetResidualBits)||targetResidualBits<1||targetResidualBits>1024||
    !Number.isSafeInteger(idealHashBits)||idealHashBits<1||idealHashBits>4096)
    throw new TypeError('invalid candidate model');
  // Conservative cardinality of fixed outer-binding checks per receipt,
  // NOT the number of internal hash or Merkle calls made by a proving SDK.
  const k=receipts*(2n*BigInt(segmentsPerReceipt)+4n),t=oracleQueries+2n;
  const numerator=k*(12n*t*t*t+4n);
  const nForHalf=ceilLog2(2n*numerator);
  const nForResidual=ceilLog2(numerator*(1n<<BigInt(targetResidualBits)));
  const model=idealCollisionBound({outputBits:idealHashBits,adversaryQueries:oracleQueries,candidatePairs:k});
  return {
    schema:'AEGIS_V4_OUTER_BINDING_IDEAL_SCREEN_V1',
    use:'architecture-sizing-only-not-a-security-claim',
    model:'ideal-binary-quantum-random-oracle-and-unproved-collision-reduction',
    outer_scheme:'SHA-512 framed 512-bit commitments (candidate only)',
    scenario:{global_quantum_oracle_queries:oracleQueries.toString(),
      receipts_attempts:receipts.toString(),segments_per_receipt:segmentsPerReceipt,
      abstract_outer_candidate_pairs:k.toString(),internal_sdk_hash_calls_counted:false,
      maximum_attempts_enforced:false},
    ideal_upper_bound:model.conditional_collision_probability_upper_bound,
    hash_bits_in_experimental_outer_codec:512,
    ideal_hash_bits_modeled:idealHashBits,
    conditional_half_success_criterion:idealHashBits>=nForHalf,
    conditional_residual_criterion:idealHashBits>=nForResidual,
    sufficient_ideal_output_bits_for_half_success:nForHalf,
    sufficient_ideal_output_bits_for_residual:nForResidual,
    target_residual_bits:targetResidualBits,
    applicability:{
      first_bad_event_reduction_to_collision_proved:false,
      uniform_random_oracle_matches_sha512:false,
      sdk_internal_hashes_are_512_bit:false,
      exact_plonky3_air_and_qrom_reduction_proved:false,
      adaptive_attempts_bounded:false
    },
    demonstrated_composite_quantum_soundness:null,
    demonstrated_post_quantum_bits:null,
    aegis_target_met:false,
    production_ready:false
  };
}
