// Exact arithmetic for the finite CMS19 inequality already used by the
// standalone FRI screen. This sizes CONDITIONAL obligations; it does not prove
// that the RISC Zero transcript, IOP, hashes or composition meet them.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
function frac(n,d){const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};}
function rational(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='denominator,numerator')throw new TypeError('canonical probability fraction required');
  const parse=s=>{if(typeof s!=='string'||s.length>20000||!/^(0|[1-9][0-9]*)$/.test(s))throw new TypeError('bounded decimal fraction required');return BigInt(s);};
  const n=parse(value.numerator),d=parse(value.denominator);
  if(d===0n||n>d||gcd(n,d)!==1n)throw new TypeError('reduced probability fraction required');
  return {n,d};
}
function count(n,min=0n){if(typeof n!=='bigint'||n<min||n>=(1n<<4096n))throw new TypeError('bounded bigint count required');}
function bits(n){if(!Number.isSafeInteger(n)||n<1||n>4096)throw new TypeError('invalid bit count');}
const ceilLog2=n=>n<=1n?0:(n-1n).toString(2).length;

export function deriveConditionalCmsBudget({oracleQueries=1n<<128n,receipts=1n<<32n,segmentsPerReceipt=64n,
  expansionQueriesPerInstance=1_000_000n,expandedPairsPerInstance=1_000_000n,targetFailureBits=1}={}){
  for(const n of [oracleQueries,receipts,segmentsPerReceipt])count(n,1n);
  for(const n of [expansionQueriesPerInstance,expandedPairsPerInstance])count(n);
  bits(targetFailureBits);
  const instances=receipts*segmentsPerReceipt;
  // Conservatively include the allowance for the entire horizon in each
  // reduction and charge the full GLOBAL adversary budget in each union term.
  const expansionQueries=instances*expansionQueriesPerInstance;
  const expandedPairs=instances*expandedPairsPerInstance;
  const t=oracleQueries+expansionQueries;
  const allocations=3n*(1n<<BigInt(targetFailureBits));
  const rbrDenominator=allocations*instances*12n*t*t;
  const collisionSpace=allocations*instances*48n*t*t*t;
  const expansionSpace=allocations*instances*2n*expandedPairs;
  return {
    schema:'AEGIS_CONDITIONAL_CMS_BUDGET_V1',
    scope:'research-scenario-sizing-only',
    scenario:{oracle_queries_global:oracleQueries.toString(),receipts:receipts.toString(),segments_per_receipt:segmentsPerReceipt.toString(),
      instances:instances.toString(),expansion_queries_per_instance:expansionQueriesPerInstance.toString(),
      expanded_pairs_per_instance:expandedPairsPerInstance.toString(),global_expansion_query_allowance:expansionQueries.toString(),
      global_expanded_pair_allowance:expandedPairs.toString(),t:t.toString(),target_total_failure:frac(1n,1n<<BigInt(targetFailureBits))},
    allocation:{global_terms:3,maximum_per_global_term:frac(1n,allocations)},
    required:{maximum_round_by_round_error:frac(1n,rbrDenominator),
      sufficient_power_of_two_rbr_error_bits:ceilLog2(rbrDenominator),
      minimum_ideal_hash_range_for_collision_term:collisionSpace.toString(),
      minimum_ideal_hash_range_for_expansion_term:expansionSpace.toString(),
      minimum_binary_hash_bits_for_this_allocation:Math.max(ceilLog2(collisionSpace),ceilLog2(expansionSpace))},
    assumptions:[
      'The finite CMS19 construction, expansion and oracle model must apply exactly; this is not established for RISC Zero.',
      'Every instance needs an applicable conditional bound given the prior history, including adaptive statements. A fixed-statement theorem alone does not justify this lifetime union.',
      'Expansion-query and expanded-pair allowances are assumptions, not measured or enforced engine limits.',
      'Oracle-query complexity does not specify elementary-gate cost, memory architecture, wall time or a NIST security category.',
    ],
    applicable_to_accepted_engine:false,aegis_target_met:false,production_ready:false,
  };
}

export function evaluateConditionalCmsBound({budget,roundByRoundError,hashBits=512}){
  bits(hashBits);
  if(budget?.schema!=='AEGIS_CONDITIONAL_CMS_BUDGET_V1')throw new TypeError('conditional CMS budget required');
  // Recompute from its scenario, rather than trust editable derived thresholds.
  const s=budget.scenario;
  const decimal=s=>{if(typeof s!=='string'||s.length>1234||!/^(0|[1-9][0-9]*)$/.test(s))throw new TypeError('bounded decimal count required');return BigInt(s);};
  const target=rational(s.target_total_failure);
  if(target.n!==1n||(target.d&(target.d-1n))!==0n)throw new TypeError('power-of-two failure target required');
  const recomputed=deriveConditionalCmsBudget({oracleQueries:decimal(s.oracle_queries_global),receipts:decimal(s.receipts),
    segmentsPerReceipt:decimal(s.segments_per_receipt),expansionQueriesPerInstance:decimal(s.expansion_queries_per_instance),
    expandedPairsPerInstance:decimal(s.expanded_pairs_per_instance),targetFailureBits:target.d.toString(2).length-1});
  const scenario=recomputed.scenario;
  if(roundByRoundError===null||roundByRoundError===undefined)return {
    status:'missing-round-by-round-evidence',conditional_failure_upper_bound:null,conditional_inequality_holds:false,
    applicable_to_accepted_engine:false,aegis_target_met:false,production_ready:false,
  };
  const {n,d}=rational(roundByRoundError),t=BigInt(scenario.t),instances=BigInt(scenario.instances);
  const a=BigInt(scenario.global_expanded_pair_allowance),space=1n<<BigInt(hashBits);
  const terms={rbr_reduction:frac(instances*12n*t*t*n,d),hash_collisions:frac(instances*48n*t*t*t,space),expansion:frac(instances*2n*a,space)};
  const numerator=instances*(12n*t*t*n*space+(48n*t*t*t+2n*a)*d),denominator=d*space;
  const targetDenominator=BigInt(scenario.target_total_failure.denominator);
  return {
    status:'conditional-formula-only',hash_bits:hashBits,global_terms:terms,
    conditional_failure_upper_bound:frac(numerator>denominator?denominator:numerator,denominator),
    conditional_inequality_holds:numerator*targetDenominator<=denominator,
    applicable_to_accepted_engine:false,aegis_target_met:false,production_ready:false,
  };
}
