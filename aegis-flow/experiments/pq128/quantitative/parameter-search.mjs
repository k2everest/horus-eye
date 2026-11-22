// Bounded combinatorial search of CONDITIONAL inequalities already used in
// this laboratory. This creates no cryptographic algorithm, proof, extractor
// or evidence that a particular implementation satisfies the cited theorems.
import {deriveConditionalCmsBudget,evaluateConditionalCmsBound} from './budget.mjs';

const P=(1n<<64n)-(1n<<32n)+1n;
const freeze=Object.freeze;
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const fraction=(n,d)=>{const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
const parse=f=>({n:BigInt(f.numerator),d:BigInt(f.denominator)});
const greater=(a,b)=>{a=parse(a);b=parse(b);return a.n*b.d>b.n*a.d;};
const allowed=['extensionDegrees','domainLogs','queryCounts','idealHashBits','oracleQueries','receipts',
  'segmentsPerReceipt','expansionQueriesPerInstance','expandedPairsPerInstance','targetFailureBits','maxCombinations'];
const defaults=freeze({extensionDegrees:freeze([5,6,8]),domainLogs:freeze([12,16,20]),
  queryCounts:freeze([640,720,896,1024]),idealHashBits:freeze([256,384,512,576,768])});
function integer(v,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)throw new TypeError('bounded integer parameter required');return v;}
function count(v,min,max){if(typeof v!=='bigint'||v<min||v>max)throw new TypeError('bounded bigint parameter required');return v;}
function grid(values,min,max){
  if(!Array.isArray(values))throw new TypeError('parameter grid array required');
  const length=integer(values.length,1,64),copy=[];
  for(let i=0;i<length;i++)copy.push(integer(values[i],min,max));
  if(new Set(copy).size!==length)throw new TypeError('duplicate parameter grid values');
  return freeze(copy.sort((a,b)=>a-b));
}
function aboveTarget(value,target){return greater(value,target);}
function reduction(error,budget){
  const {n,d}=parse(error),s=budget.scenario;
  return fraction(BigInt(s.instances)*12n*BigInt(s.t)**2n*n,d);
}
function row(budget,extensionDegree,domainLog2,queries,hashBits){
  const domain=1n<<BigInt(domainLog2),field=P**BigInt(extensionDegree);
  const algebraic=fraction(7n**7n*domain**2n,48n*field);
  const sampling=fraction(3n**BigInt(queries),4n**BigInt(queries));
  const error=greater(algebraic,sampling)?algebraic:sampling;
  const evaluated=evaluateConditionalCmsBound({budget,roundByRoundError:error,hashBits});
  const target=budget.scenario.target_total_failure,reasons=[];
  if(!evaluated.conditional_inequality_holds){
    if(aboveTarget(reduction(algebraic,budget),target))reasons.push('algebraic-floor');
    if(aboveTarget(reduction(sampling,budget),target))reasons.push('sampling');
    if(aboveTarget(evaluated.global_terms.hash_collisions,target))reasons.push('hash-collisions');
    if(aboveTarget(evaluated.global_terms.expansion,target))reasons.push('expansion');
    if(!reasons.length)reasons.push('sum-of-terms');
  }
  return freeze({extension_degree:extensionDegree,domain_log2:domainLog2,queries,ideal_hash_bits:hashBits,
    field_cardinality:field.toString(),round_by_round_error:freeze({algebraic:freeze(algebraic),sampling:freeze(sampling),
      assumed_maximum:freeze(error),dominant_term:greater(algebraic,sampling)?'algebraic':'sampling'}),
    conditional_failure_upper_bound:freeze(evaluated.conditional_failure_upper_bound),
    conditional_inequality_holds:evaluated.conditional_inequality_holds,failure_reasons:freeze(reasons),
    extension_arithmetic_implemented_in_reference:extensionDegree===5,
    within_reference_fri_resource_limits:extensionDegree===5&&domainLog2>=3&&domainLog2<=16&&queries<=1024,
    theorem_hypotheses_discharged:false,financial_air_proved:false,
    knowledge_demonstrated:false,privacy_demonstrated:false,
    applicable_to_accepted_engine:false,aegis_target_met:false,production_ready:false});
}

export function searchConditionalParameters(options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!allowed.includes(k)))
    throw new TypeError('explicit conditional search options required');
  const extensionDegrees=grid(options.extensionDegrees??defaults.extensionDegrees,2,32);
  const domainLogs=grid(options.domainLogs??defaults.domainLogs,2,32);
  const queryCounts=grid(options.queryCounts??defaults.queryCounts,1,4096);
  const idealHashBits=grid(options.idealHashBits??defaults.idealHashBits,1,2048);
  const cap=integer(options.maxCombinations??4096,1,4096);
  const combinations=extensionDegrees.length*domainLogs.length*queryCounts.length*idealHashBits.length;
  if(combinations>cap)throw new RangeError('CONDITIONAL_PARAMETER_SEARCH_BUDGET_EXCEEDED');
  const oracleQueries=count(options.oracleQueries??(1n<<128n),1n,1n<<256n);
  const receipts=count(options.receipts??(1n<<32n),1n,1n<<64n);
  const segmentsPerReceipt=count(options.segmentsPerReceipt??64n,1n,64n);
  const expansionQueriesPerInstance=count(options.expansionQueriesPerInstance??1_000_000n,0n,1n<<48n);
  const expandedPairsPerInstance=count(options.expandedPairsPerInstance??1_000_000n,0n,1n<<48n);
  const targetFailureBits=integer(options.targetFailureBits??1,1,256);
  const budget=deriveConditionalCmsBudget({oracleQueries,receipts,segmentsPerReceipt,
    expansionQueriesPerInstance,expandedPairsPerInstance,targetFailureBits});
  const results=[],failureCounts={'algebraic-floor':0,sampling:0,'hash-collisions':0,expansion:0,'sum-of-terms':0};
  let passing=0;
  for(const degree of extensionDegrees)for(const domain of domainLogs)for(const queries of queryCounts)for(const hash of idealHashBits){
    const result=row(budget,degree,domain,queries,hash);results.push(result);
    if(result.conditional_inequality_holds)passing++;
    for(const reason of result.failure_reasons)failureCounts[reason]++;
  }
  return freeze({schema:'AEGIS_CONDITIONAL_PARAMETER_SEARCH_V1',
    purpose:'combinatorial-sizing-of-conditional-formulas-only',
    model:'Goldilocks-cardinality-and-standalone-Theorem-6-error-in-finite-CMS-budget',
    criterion:freeze({global_quantum_oracle_query_budget:oracleQueries.toString(),target_failure_bits:targetFailureBits,
      target_failure:freeze(budget.scenario.target_total_failure),
      meaning:targetFailureBits===1?'at-most-one-half-in-the-conditional-query-model':'explicit-residual-probability-target-not-a-bit-strength-label'}),
    grid:freeze({extension_degrees:extensionDegrees,domain_logs:domainLogs,query_counts:queryCounts,ideal_hash_bits:idealHashBits}),
    resource_limit:cap,total_combinations:combinations,
    counts:freeze({conditional_pass:passing,conditional_fail:combinations-passing,
      failure_reasons_nonexclusive:freeze(failureCounts)}),
    budget,results:freeze(results),
    limitations:freeze([
      'Degrees other than five are hypothetical field cardinalities: no extension arithmetic, irreducibility or prover is implemented by this search.',
      'Theorem-6 RBR error is assumed for an abstract standalone FRI, not proved for a financial AIR, Plonky3 or RISC Zero.',
      'CMS compiler equivalence, uniform adaptive/lifetime bounds and expansion counts remain unproved assumptions.',
      'Hash lengths describe ideal binary random oracles: extending a concrete hash or XOF output does not instantiate this model.',
      'The supplied RBR expression omits other financial-protocol errors, knowledge extraction and zero knowledge.',
      'No proof or new cryptographic construction is generated; no conditional candidate authorizes consensus or production.',
    ]),proofs_generated:0,novel_cryptographic_algorithms_tested:0,
    demonstrated_post_quantum_bits:null,applicable_to_accepted_engine:false,aegis_target_met:false,production_ready:false});
}
