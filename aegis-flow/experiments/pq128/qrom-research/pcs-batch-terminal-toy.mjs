// Conditional, fixed-claim linear PCS batching toy. Not Plonky3 PCS.
// Claims must be bound BEFORE alpha. All positions fixed before queries.
const invalid=()=>{throw new TypeError('INVALID_PCS_BATCH_TOY');};
const mod=(a,p)=>((a%p)+p)%p;
const prime=p=>Number.isSafeInteger(p)&&p>=5&&p<=257&&
  Array.from({length:Math.floor(Math.sqrt(p))-1},(_,i)=>i+2)
    .every(d=>p%d!==0);
export function classifyPcsBatchToy({prime:p,discrepancies,alpha,queries}={}){
  if(!prime(p)||!Array.isArray(discrepancies)||discrepancies.length<1||
    discrepancies.length>32||!Array.isArray(discrepancies[0])||
    discrepancies[0].length<1||discrepancies[0].length>16||
    !discrepancies.every(v=>Array.isArray(v)&&
      v.length===discrepancies[0].length&&
      v.every(x=>Number.isSafeInteger(x)&&x>=0&&x<p))||
    !Number.isSafeInteger(alpha)||alpha<0||alpha>=p||
    !Array.isArray(queries)||queries.length<1||
    !queries.every(q=>Number.isSafeInteger(q)&&q>=0&&q<discrepancies.length))
    invalid();
  const first=discrepancies.findIndex(row=>row.some(x=>x!==0));
  const residuals=discrepancies.map(row=>{
    let power=1,result=0;
    for(const x of row){result=mod(result+power*x,p);power=mod(power*alpha,p);}
    return result;
  });
  const batchedCancellation=first!==-1&&residuals[first]===0;
  const sampledMiss=queries.every(q=>residuals[q]===0);
  const accepted=sampledMiss;
  const badQuery=first!==-1&&!batchedCancellation&&sampledMiss;
  if(accepted&&first!==-1&&!batchedCancellation&&!badQuery)
    throw Error('BATCH_TERMINAL_DICHOTOMY_VIOLATED');
  return Object.freeze({
    schema:'AEGIS_FIXED_CLAIM_LINEAR_PCS_BATCH_TOY_V1',
    first_nonzero_position:first,
    original_claims_consistent:first===-1,
    canonical_bad_alpha:batchedCancellation,
    query_missed_nonzero_batch:badQuery,
    accepted,
    invalid_acceptance_is_exceptional:first===-1||!accepted||
      batchedCancellation||badQuery,
    actual_plonky3_batching_equivalence_proved:false,
    quantum_commitment_extraction_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
