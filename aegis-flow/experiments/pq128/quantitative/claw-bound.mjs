// Finite accounting for one claw-search construction on TWO INDEPENDENT IDEAL
// RANDOM FUNCTIONS. No real SHA function is queried or attacked. Oracle-query
// complexity is not a bound on gates, coherent memory, hardware cost or time.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const fraction=(n,d)=>{const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
function integer(n,min,max){if(!Number.isSafeInteger(n)||n<min||n>max)throw new TypeError('invalid ideal-model bit count');}

export function idealClawBound({outputBits=256,tableBits=86,queryBudget=1n<<128n}={}){
  integer(outputBits,16,4096);integer(tableBits,8,4096);
  const difference=outputBits-tableBits;
  if(difference<8||difference%2!==0)throw new TypeError('n-c must be even and at least eight');
  if(typeof queryBudget!=='bigint'||queryBudget<1n||queryBudget>(1n<<4096n))throw new TypeError('query budget must be a positive bounded bigint');
  const N=1n<<BigInt(outputBits),k=1n<<BigInt(tableBits);
  // Conditions imply p=k/N<=1/256. j is an exact integer, not a floating
  // approximation to a Grover angle or an asymptotic cost exponent.
  const j=1n<<BigInt(difference/2-1);
  const queriesPerRestart=2n*j+2n,queries=k+4n*queriesPerRestart;
  const collisionNumerator=k*(k-1n),collisionDenominator=2n*N;
  // E: all k table outputs are distinct. Conditionally on E, independence of
  // F1 gives M~Bin(N,k/N); Chebyshev bounds the bad window by 4/k.
  // The conditional window bound is uniform over every distinct-output table,
  // so multiplication gives max(0,1-k(k-1)/(2N)) * (1-4/k).
  const jointDenominator=2n*N*k;
  const distinctNumerator=collisionDenominator>collisionNumerator?collisionDenominator-collisionNumerator:0n;
  const jointNumerator=distinctNumerator*(k-4n);
  return {
    schema:'AEGIS_IDEAL_CLAW_QUERY_BOUND_V1',
    scope:'random-oracle-query-model',
    theorem_status:'internal-finite-derivation-for-ideal-model',
    parameters:{output_bits:outputBits,table_bits:tableBits,domain_and_range_size:N.toString(),
      table_entries:k.toString(),grover_iterations_per_restart:j.toString(),grover_restarts:4,
      assumed_success_per_restart_given_good_event:fraction(1n,5n)},
    oracle_queries:queries.toString(),
    query_accounting:{table_build:k.toString(),per_restart:queriesPerRestart.toString(),
      phase_oracle_queries_per_iteration:2,extra_queries_per_restart:2,restarts:4},
    memory_entries:k.toString(),query_budget:queryBudget.toString(),
    probability_bounds:{
      table_collision_upper_bound:fraction(collisionNumerator>collisionDenominator?collisionDenominator:collisionNumerator,collisionDenominator),
      distinct_table_outputs_lower_bound:fraction(distinctNumerator,collisionDenominator),
      bad_window_upper_bound_given_distinct_outputs:fraction(4n,k),
      joint_good_event_lower_bound:fraction(jointNumerator,jointDenominator),
      four_restart_success_lower_bound_given_good_event:fraction(369n,625n),
    },
    success_probability_lower_bound:fraction(369n*jointNumerator,625n*jointDenominator),
    fits_query_budget:queries<=queryBudget,
    aegis_target_met:false,production_ready:false,
    assumptions:[
      'F0 and F1 are independent uniformly sampled functions [N] -> [N]; this is an ideal-function ensemble, not a theorem about a concrete SHA implementation.',
      'The table uses k distinct F0 inputs. Conditional on distinct table outputs, the F1 marked-set size is binomial with mean k.',
      'On k/2 <= M <= 3k/2, the chosen Grover iteration count has per-restart success at least 1/5; four independent restarts give at least 369/625.',
      'Coherent membership lookup in the k-entry table is internal work uncharged in this oracle-query model. Its gates, depth, memory architecture, fault tolerance and elapsed time are not bounded here.',
      'This is only the stated ideal claw-search construction. It does not establish a real hash attack, complete Aegis transaction forgery, or a numeric security qualification of the protocol.',
    ],
  };
}
