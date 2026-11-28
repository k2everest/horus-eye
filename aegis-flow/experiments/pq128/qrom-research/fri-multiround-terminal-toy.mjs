// Exact-code FRI multi-round terminal covering over coherent, fixed oracles.
// This models an idealized IOP with authenticated complete oracle words,
// not the Plonky3 executable transcript, hiding PCS or quantum commitments.
import {foldToy,isToyLowDegree} from './fri-terminal-toy.mjs';
const fail=()=>{throw new TypeError('INVALID_MULTIROUND_FRI_TOY');};
export function classifyMultiRoundFriTerminal({
  prime,domain,words,betas,degreeBound,queryPositions
}={}){
  if(!Array.isArray(words)||words.length<2||words.length>5||
     !Array.isArray(betas)||betas.length!==words.length-1||
     !Array.isArray(queryPositions)||queryPositions.length<1||
     !Number.isSafeInteger(degreeBound)||degreeBound<2||
     !Number.isSafeInteger(prime)||prime<5||
     !Array.isArray(domain)||domain.length<2||domain.length>16)fail();
  let currentDomain=domain,limit=degreeBound;
  const stages=[];
  const domains=[currentDomain];
  for(let i=0;i<betas.length;i++){
    if(limit%2!==0||limit<2||!Array.isArray(words[i])||
       !Array.isArray(words[i+1])||words[i].length!==currentDomain.length||
       words[i+1].length!==currentDomain.length/2)fail();
    const folded=foldToy({prime,domain:currentDomain,
      values:words[i],beta:betas[i]});
    const lowBefore=isToyLowDegree(prime,currentDomain,words[i],limit);
    const lowAfter=isToyLowDegree(prime,folded.domain,words[i+1],limit/2);
    const trueFoldLow=isToyLowDegree(prime,folded.domain,folded.values,limit/2);
    const differences=Object.freeze(folded.values.flatMap((v,j)=>
      v===words[i+1][j]?[]:[j]));
    stages.push(Object.freeze({index:i,degree_bound:limit,
      input_is_codeword:lowBefore,successor_is_codeword:lowAfter,
      true_fold_is_codeword:trueFoldLow,
      exceptional_fold:!lowBefore&&trueFoldLow,
      discrepancy_positions:differences}));
    currentDomain=folded.domain;
    domains.push(currentDomain);
    limit/=2;
  }
  const finalCodeword=isToyLowDegree(prime,currentDomain,words.at(-1),limit);
  const indices=[];
  for(const q of queryPositions){
    if(!Number.isSafeInteger(q)||q<0||q>=domain.length)fail();
    let x=domain[q],position=q,track=[];
    for(let i=0;i<stages.length;i++){
      const y=(x*x)%prime;
      const next=domains[i+1].indexOf(y);
      if(next<0)fail();
      track.push(next);x=y;position=next;
    }
    indices.push(Object.freeze(track));
  }
  const missed=stages.map((stage,i)=>
    stage.discrepancy_positions.every(j=>!indices.some(path=>path[i]===j)));
  const accepted=finalCodeword&&missed.every(Boolean);
  const initialLow=stages[0].input_is_codeword;
  const exceptionalFold=stages.some(s=>s.exceptional_fold);
  const mismatchMiss=stages.some((s,i)=>s.discrepancy_positions.length>0&&missed[i]);
  const firstGood=stages.findIndex(s=>s.input_is_codeword);
  // If the initial oracle is invalid and final is valid, the first
  // invalid -> valid transition must have a low true fold or a mismatch.
  const firstInvalidToGood=stages.findIndex(s=>
    !s.input_is_codeword&&s.successor_is_codeword);
  const covered=!accepted||initialLow||exceptionalFold||mismatchMiss;
  if(!covered)throw new Error('MULTIROUND_FRI_TERMINAL_COVERING_VIOLATED');
  return Object.freeze({
    schema:'AEGIS_MULTIROUND_FRI_EXACT_CODE_IDEAL_IOP_V1',
    stages:Object.freeze(stages),
    final_codeword:finalCodeword,
    initial_codeword:initialLow,
    first_invalid_to_good_transition:firstInvalidToGood,
    accepted,exceptional_fold:exceptionalFold,
    query_missed_committed_discrepancy:mismatchMiss,
    accepting_invalid_implies_bad_event:covered,
    query_paths:Object.freeze(indices),
    // No malicious post-query openings in an ideal IOP; commitments and
    // hashes belong to the compiler/security reduction, not this lemma.
    actual_plonky3_equivalence_proved:false,
    fri_proximity_bound_proved:false,
    quantum_vector_commitment_extraction_proved:false,
    cms_rbr_knowledge_proved:false,
    pq128_demonstrated:false,production_ready:false
  });
}
