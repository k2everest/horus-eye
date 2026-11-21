// Research-only soundness decomposition for the accepted Composite receipt.
// All numerical upper bounds are HYPOTHETICAL unless externally proved for
// the exact verifier, interactive IOP, hash compiler and adaptive whole chain.
// Never import into block admission, wallet code or consensus policy.
import {idealCollisionBound} from './ideal-collision-bound.mjs';
import {deriveConditionalCmsBudget} from './budget.mjs';

const IDS=['compiled_segment','adjacent_state_binding','journal_binding','program_identity_binding'];
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const rational=(n,d)=>{if(d<=0n||n<0n)throw new TypeError('invalid rational');
  const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
const parseFraction=v=>{
  if(v===null||v===undefined)return null;
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='denominator,numerator')
    throw new TypeError('canonical probability required');
  const integer=s=>{if(typeof s!=='string'||s.length>1500||!/^(0|[1-9][0-9]*)$/.test(s))throw new TypeError('bounded decimal fraction required');return BigInt(s);};
  const n=integer(v.numerator),d=integer(v.denominator);
  if(d===0n||n>d||gcd(n,d)!==1n)throw new TypeError('reduced probability required');
  return {n,d};
};
const count=x=>{if(typeof x!=='bigint'||x<1n||x>(1n<<256n))throw new TypeError('bounded receipt count required');return x;};
const ceilLog2=n=>n<=1n?0:(n-1n).toString(2).length;
const bits=n=>{if(!Number.isSafeInteger(n)||n<1||n>4096)throw new TypeError('invalid target bits');return n;};

// A first-bad-event *accounting template*, NOT a proof of its exhaustive
// coverage: trace correctness and transcript binding must first be proved.
export function modelCompositeSoundness({
  receipts=1n<<32n,maxSegments=64,targetFailureBits=1,
  perSegmentFailure=null,perLinkFailure=null,perJournalFailure=null,
  perProgramIdentityFailure=null,oracleQueries=1n<<128n,
}={}){
  count(receipts);count(oracleQueries);bits(targetFailureBits);
  if(!Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>64)
    throw new TypeError('only accepted 1..64 Composite segments may be modeled');
  const m=BigInt(maxSegments),segments=receipts*m,links=receipts*(m-1n);
  const events=[
    {id:IDS[0],count:segments,rate:perSegmentFailure,
      obligation:'Uniform adaptive soundness bound for the actual compiled segment protocol, including applicable FRI/DEEP/ALI, Merkle oracle and Fiat-Shamir QROM losses'},
    {id:IDS[1],count:links,rate:perLinkFailure,
      obligation:'Authenticity of adjacent pre/post execution state claims, including actual digest, encoding and composition checks'},
    {id:IDS[2],count:receipts,rate:perJournalFailure,
      obligation:'Binding of the full public journal to the verified end state under the actual receipt claim hash'},
    {id:IDS[3],count:receipts,rate:perProgramIdentityFailure,
      obligation:'Binding of the trusted program image ID to the executed program and its initial claim'},
  ];
  const requiredBits=bits(targetFailureBits);
  const familyCount=BigInt(events.length);
  let sumN=0n,sumD=1n,allKnown=true;
  const families=events.map(e=>{
    const p=parseFraction(e.rate);
    if(p){
      const n=p.n*e.count,d=p.d;sumN=sumN*d+n*sumD;sumD*=d;
      const g=gcd(sumN,sumD);sumN/=g;sumD/=g;
    }else allKnown=false;
    return {
      id:e.id,event_upper_count:e.count.toString(),
      assumed_uniform_adaptive_per_event_error:p?rational(p.n,p.d):null,
      sufficient_binary_bits_per_event_equal_family_allocation:ceilLog2(familyCount*e.count*(1n<<BigInt(requiredBits))),
      obligation:e.obligation,source_theorem_for_exact_sdk:null,
    };
  });
  const result=allKnown?rational(sumN>sumD?sumD:sumN,sumD):null;
  const passedHypothetical=allKnown&&sumN*(1n<<BigInt(requiredBits))<=sumD;
  // Neither of the following numbers proves anything about concrete SHA-256
  // or Poseidon2. The game simply tests how permissive a quantum random-oracle
  // collision upper bound can be at the chosen query budget.
  const ideal256=idealCollisionBound({outputBits:256,adversaryQueries:oracleQueries,candidatePairs:links});
  const ideal512=idealCollisionBound({outputBits:512,adversaryQueries:oracleQueries,candidatePairs:links});
  const cms=deriveConditionalCmsBudget({oracleQueries,receipts,segmentsPerReceipt:m,targetFailureBits});
  return {
    schema:'AEGIS_COMPOSITE_QUANTUM_SOUNDNESS_RESEARCH_V1',
    scope:'conditional-first-bad-event-accounting-not-an-instantiated-reduction',
    accepted_profile:{sdk:'3.1.0',receipt_kind:'composite',hash:'poseidon2',max_segments:maxSegments,
      fri_queries:50,extension_degree:4,fri_fold:16},
    research_assumptions:{global_oracle_queries:oracleQueries.toString(),receipts_including_failed_attempts:receipts.toString(),
      attempts_limit_enforced_by_network:false,
      assumed_uniform_adaptive_error_for_every_prior_history:false,
      source_binary_attestation:false,all_failure_modes_proved_exhaustive:false},
    counts:{segments:segments.toString(),adjacent_boundaries:links.toString(),
      journal_events:receipts.toString(),trusted_program_events:receipts.toString()},
    target_total_failure:rational(1n,1n<<BigInt(targetFailureBits)),
    event_families:families,
    computed_union_bound_if_all_assumptions_hold:result,
    hypothetical_target_inequality_holds:passedHypothetical,
    qrom_cms_thresholds:cms.required,
    collision_diagnostics:{
      cross_link_ideal_256:ideal256.conditional_collision_probability_upper_bound,
      cross_link_ideal_512:ideal512.conditional_collision_probability_upper_bound,
      note:'Illustrative binary quantum random-oracle collision games with candidatePairs=adjacent boundaries; NOT a bound for concrete SHA-256 state links, image IDs, journal, or Poseidon2. A saturated upper bound of 1 proves no actual attack.',
    },
    missing_proofs:[
      'RBR or state-restoration soundness theorem for the exact RISC Zero 3.1.0 compiled IOP and folding-16 FRI',
      'Applicable tight QROM/Fiat-Shamir compiler theorem and assumption mapping to SDK Poseidon2 sponge, encodings and samplers',
      'Quantum binding of state continuity, journal and trusted image ID under concrete SHA-256 and Poseidon2',
      'Exhaustive first-bad-event composition/refinement of the actual Composite receipt to a single false financial statement',
      'Uniform adaptive/lifetime reduction with a bound on every attempt including failed and unpublished attempts',
    ],
    demonstrated_whole_receipt_soundness_bound:null,
    demonstrated_post_quantum_bits:null,
    aegis_target_met:false,production_ready:false,
  };
}
