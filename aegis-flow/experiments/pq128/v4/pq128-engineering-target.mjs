// Target engineering BCS/QROM budget; not a claim that the current
// Plonky3 verifier or the upstream theorem satisfies it.
// Based on the *form* Adv_BCS = O(Q^2 * eps_RBR + Q^3 / 2^lambda),
// with unknown constant absorbed into an explicitly HYPOTHETICAL reserve.
const P=2013265921n;
export function pq128EngineeringTarget({
  quantumQueryBits=128,attemptBits=32,segmentBits=6,eventBits=2,
  theoremConstantReserveBits=32,rbrTargetBits=336,
  hashOutputBits=512,fieldDegree=16,
}={}){
  for(const [name,val,min,max] of [
    ['quantumQueryBits',quantumQueryBits,1,256],
    ['attemptBits',attemptBits,0,64],['segmentBits',segmentBits,0,16],
    ['eventBits',eventBits,0,16],['theoremConstantReserveBits',theoremConstantReserveBits,0,128],
    ['rbrTargetBits',rbrTargetBits,1,1024],['hashOutputBits',hashOutputBits,1,2048],
    ['fieldDegree',fieldDegree,1,32],
  ])if(!Number.isSafeInteger(val)||val<min||val>max)throw new RangeError('invalid '+name);
  const events=attemptBits+segmentBits+eventBits;
  const algebraicLoss=2*quantumQueryBits+events;
  const hashLoss=3*quantumQueryBits+events;
  const algebraicResidual=rbrTargetBits-algebraicLoss-theoremConstantReserveBits;
  const hashResidual=hashOutputBits-hashLoss-theoremConstantReserveBits;
  const logupNumeratorBits=27; // exact 4*2^23*(2+2)=2^27
  const fieldSize=P**BigInt(fieldDegree);
  const logupBound=fieldSize/(1n<<BigInt(logupNumeratorBits));
  const logupRbrFloorBits=logupBound<=0n?0:logupBound.toString(2).length-1;
  return Object.freeze({
    schema:'AEGIS_V4_PQ128_ENGINEERING_BUDGET_V1',
    quantum_queries:(1n<<BigInt(quantumQueryBits)).toString(),
    hypothetical_total_event_log2:events,
    theorem_constant_reserve_hypothetical_bits:theoremConstantReserveBits,
    target_rbr_bits:rbrTargetBits,
    algebraic_Q2_and_event_loss_bits:algebraicLoss,
    hash_Q3_and_event_loss_bits:hashLoss,
    conditional_logup_field_degree:fieldDegree,
    conditional_logup_field_bits:Math.log2(2013265921)*fieldDegree,
    conditional_logup_rbr_bits_floor:logupRbrFloorBits,
    conditional_logup_margin_over_rbr_target_bits:logupRbrFloorBits-rbrTargetBits,
    conditional_algebraic_residual_bits_after_reserve:algebraicResidual,
    conditional_hash_residual_bits_after_reserve:hashResidual,
    necessary_logup_margin_positive:logupRbrFloorBits>=rbrTargetBits,
    necessary_hash_margin_positive:hashResidual>1,
    commitment_collision_counted_separately_from_RBR:true,
    actual_FRI_soundness_bits:null,
    actual_lookup_FRI_composed_soundness_bits:null,
    theorem_constant_known:false,
    theorem_applies_to_Pl3_proof:false,
    proposed_field_constructed_and_audited:false,
    quantum_privacy_and_knowledge_demonstrated:false,
    live_consensus_PQ128:false,
    pq128_demonstrated:false,
    production_ready:false,
  });
}
