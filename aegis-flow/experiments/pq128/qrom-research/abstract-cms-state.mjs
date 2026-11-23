// Executable realization of the PROPOSED S* predicate in a finite, idealized
// model with externally supplied pre-challenge predicates K_i and B_i.
// NOT derived from real Plonky3 commitments. Never a theorem certificate.
import {validateWiredTranscriptPrefix} from './round-state.mjs';
const SPEC='AEGIS_WIRED_CMS_ABSTRACT_STATE_RESEARCH_V1';
function normalizedSet(xs,permitted,label){
  if(!Array.isArray(xs)||new Set(xs).size!==xs.length||
    !xs.every(x=>typeof x==='string'&&permitted.has(x)))
    throw new TypeError('INVALID_'+label);
  return new Set(xs);
}
export function evaluateAbstractCmsState(schedule,eventIds,{
  preChallengeWitnessAvailableAt=[],
  exceptionalChallengeAt=[],
  finalVerifierAccepted=null,
}={}){
  const audit=validateWiredTranscriptPrefix(schedule,eventIds);
  const permitted=new Set(schedule.verifier_challenges);
  // Predicates below are mathematical inputs, not proof-supplied data.
  const witness=normalizedSet(preChallengeWitnessAvailableAt,permitted,'K_PREDICATE');
  const exceptional=normalizedSet(exceptionalChallengeAt,permitted,'B_PREDICATE');
  if(finalVerifierAccepted!==null&&typeof finalVerifierAccepted!=='boolean')
    throw new TypeError('INVALID_FINAL_VERDICT');
  const prefixStates=[0],transitions=[];
  let bit=0;
  for(let i=0;i<eventIds.length;i++){
    const step=schedule.steps[i];
    if(step.role==='verifier'&&bit===0){
      const ki=witness.has(step.id),bi=exceptional.has(step.id);
      if(ki||bi){
        bit=1;
        transitions.push(Object.freeze({
          id:step.id,
          cause:ki?'IDEAL_PRE_CHALLENGE_WITNESS':'IDEAL_BAD_CHALLENGE',
          source:'ABSTRACT_PREDICATE_NOT_CRYPTOGRAPHICALLY_VERIFIED',
        }));
      }
    }
    prefixStates.push(bit);
  }
  const finalIsKnown=audit.structurally_complete&&finalVerifierAccepted!==null;
  const terminalCovered=finalIsKnown?(finalVerifierAccepted===false||bit===1):null;
  // For a soundness/knowledge theorem, an actual mathematical proof must
  // establish K_i and an upper bound on Pr[B_i] uniformly over prefixes.
  return Object.freeze({
    schema:SPEC,
    abstract_candidate_state_bit:bit,
    symbolic_prefix_states:Object.freeze(prefixStates),
    transitions:Object.freeze(transitions),
    empty_transcript_axiom_holds_for_this_trace:prefixStates[0]===0,
    prover_move_axiom_holds_for_this_trace:prefixStates.every((v,i)=>
      i===0||v===prefixStates[i-1]||
      schedule.steps[i-1].role==='verifier'),
    terminal_coverage_on_this_trace:terminalCovered,
    pre_challenge_witness_predicates_independently_proved:false,
    all_bad_challenge_probabilities_bounded:false,
    real_iop_terminal_covering_proved:false,
    universal_state_axioms_proved:false,
    polynomial_financial_extractor_proved:false,
    bcs_qrom_instantiated:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
