// Algebraic lemma for the ACTUAL two-column WiredAir LogUp keys
// (wire_id,bit) combined as beta*wire_id + bit, with denominator
// alpha - combined_key. Research-only, fixed-oracle interactive analysis.
// Not an RBR knowledge theorem, not BCS/QROM and not a PQ128 certificate.
const BABY_BEAR = 2013265921n;
const invalid = msg => { throw new TypeError(msg); };
const uint = (x,min,max) => Number.isSafeInteger(x)&&x>=min&&x<=max;
const log2big = x => {
  if(x<=0n) return -Infinity;
  const bits=x.toString(2).length;
  const shift=BigInt(Math.max(0,bits-53));
  return Number(x>>shift) > 0
    ? Math.log2(Number(x>>shift))+Number(shift)
    : 0;
};
/**
 * Hypotheses:
 * - trusted program has 3G reads and W wire-table rows;
 * - fixed Boolean values before independent uniform alpha,beta;
 * - 3G+W < p, W < p (no multiplicity cancellation modulo p);
 * - all wire_id belong to [0,W), bit in {0,1}.
 *
 * For distinct keys (i,b) != (j,c), equal compressed keys imply
 *   (i-j)*beta = c-b mod p.
 * If i=j, b!=c, the equation is impossible. Otherwise either
 * beta=0 (b=c), or beta=+/-1/d for d=1,...,W-1.
 * Hence at most 2W-1 possible "bad beta" values.
 *
 * For good beta, nonzero rational difference has U distinct poles
 * and numerator degree <=U-1 where U<=T=3G+W. There are at most
 * U-1 numerator roots and U poles among alpha.
 *
 * Thus Pr[bad beta or bad alpha] <= (2W-1 + 2T-1) / p^d.
 * This is a safe but crude *single interactive challenge-pair* union bound.
 */
export function fixedWiredLogUpBound({
  gateCount,wireCount,extensionDegree=8,
}={}){
  if(!uint(gateCount,1,8_000_000)||
     !uint(wireCount,2,8_388_608)||
     !uint(extensionDegree,1,32)) invalid('INVALID_WIRED_PARAMETER');
  const G=BigInt(gateCount), W=BigInt(wireCount);
  const T=3n*G+W;
  if(T>=BABY_BEAR||W>=BABY_BEAR) invalid('MODULAR_MULTIPLICITY_ALIAS');
  const betaBad=2n*W-1n,alphaBad=2n*T-1n;
  const numerator=betaBad+alphaBad,denominator=BABY_BEAR**BigInt(extensionDegree);
  const previous=T*(T-1n)/2n+2n*T;
  return Object.freeze({
    schema:'AEGIS_LOGUP_FIXED_WIRED_PAIR_CONDITIONAL_BOUND_V1',
    assumptions:'canonical binary pairs fixed before two independent uniform extension-field challenges; fixed multiplicities < p',
    encoding:'beta*wire_id+bit',
    p:BABY_BEAR.toString(),degree:extensionDegree,
    T:T.toString(),
    beta_exceptional_at_most:betaBad.toString(),
    alpha_exceptional_at_most:alphaBad.toString(),
    probability_upper_bound:Object.freeze({
      numerator:numerator.toString(),denominator:denominator.toString(),
    }),
    bound_bits:log2big(denominator)-log2big(numerator),
    previous_generic_pair_bound_numerator:previous.toString(),
    improvement_bits:log2big(previous)-log2big(numerator),
    probability_capped_at_one:numerator>=denominator,
    no_bad_challenge_distribution_proved_for_committed_malicious_prover:false,
    full_logup_interactive_rbr_knowledge_proved:false,
    zero_to_one_transition_knowledge_bound_proved:false,
    qrom_compilation_proved:false,pq128_demonstrated:false,
    production_ready:false,
  });
}
const mod=(n,p)=>(n%p+p)%p;
const pow=(a,e,p)=>{
  let out=1n,b=mod(a,p);
  while(e>0n){if(e&1n)out=mod(out*b,p);b=mod(b*b,p);e>>=1n;}
  return out;
};
const key=k=>k.id+':'+k.bit;
function normalize(keyList,wireCount,prime,counts){
  if(!Array.isArray(keyList))invalid('INVALID_KEYSET');
  const map=new Map();
  let total=0n;
  for(const k of keyList){
    if(!k||!uint(k.id,0,wireCount-1)||!uint(k.bit,0,1))
      invalid('INVALID_WIRE_KEY');
    const c=counts? k.count : 1;
    if(!uint(c,0,Number(prime-1n)))invalid('INVALID_MULTIPLICITY');
    const cc=BigInt(c); total+=cc;
    const tag=key(k);
    map.set(tag,(map.get(tag)||0n)+cc);
  }
  if(total>=prime)invalid('MODULAR_MULTIPLICITY_ALIAS');
  return {map,total};
}
/** Exhaustively enumerate small PRIME base fields to validate the algebraic
 * event set. This is a finite mathematical test, NOT full Plonky3.
 */
export function exhaustiveBaseFieldLogUp({
  prime,wireCount,reads,table,
}={}){
  if(!uint(prime,5,257)||!uint(wireCount,2,prime-1)||
     !Array.isArray(reads)||!Array.isArray(table)||
     reads.length+table.length>1024)invalid('INVALID_EXHAUSTIVE_DOMAIN');
  const p=BigInt(prime);
  // Verify prime; Fermat inverses require a genuine field.
  for(let d=2;d*d<=prime;d++)if(prime%d===0)invalid('NONPRIME_DOMAIN');
  const left=normalize(reads,wireCount,p,false);
  const right=normalize(table,wireCount,p,true);
  if(left.total!==right.total)invalid('UNBALANCED_READ_COUNTS');
  const differences=new Map();
  const union=new Set([...left.map.keys(),...right.map.keys()]);
  for(const tag of union){
    const c=(left.map.get(tag)||0n)-(right.map.get(tag)||0n);
    if(c!==0n){
      const [id,bit]=tag.split(':').map(Number);
      differences.set(tag,{id,bit,coeff:c});
    }
  }
  if(differences.size===0)return Object.freeze({
    matching_multisets:true,bad_beta_count:0,bad_alpha_pairs:0,
    all_pairs:prime*prime,conditional_event_bound_valid:true,
  });
  let badBetaCount=0,badAlphaPairs=0;
  const values=[...differences.values()];
  for(let beta=0;beta<prime;beta++){
    const compressed=values.map(v=>mod(BigInt(v.id)*BigInt(beta)+BigInt(v.bit),p));
    if(new Set(compressed.map(String)).size!==compressed.length){
      badBetaCount++;continue;
    }
    for(let alpha=0;alpha<prime;alpha++){
      const a=BigInt(alpha);
      let total=0n,pole=false;
      for(let i=0;i<values.length;i++){
        const denominator=mod(a-compressed[i],p);
        if(denominator===0n){pole=true;break;}
        total=mod(total+values[i].coeff*pow(denominator,p-2n,p),p);
      }
      if(pole||total===0n)badAlphaPairs++;
    }
  }
  const T=BigInt(reads.length)+BigInt(wireCount);
  const betaCap=2n*BigInt(wireCount)-1n;
  const alphaCap=2n*T-1n;
  // Count probability with beta exceptions as all alpha values.
  const measured=BigInt(badBetaCount)*p+BigInt(badAlphaPairs);
  const upper=(betaCap+alphaCap)*p;
  return Object.freeze({
    matching_multisets:false,
    bad_beta_count:badBetaCount,
    bad_alpha_pairs:badAlphaPairs,
    all_pairs:prime*prime,
    observed_bad_pair_fraction:Object.freeze({
      numerator:measured.toString(),denominator:(p*p).toString(),
    }),
    conditional_event_bound_valid:measured<=upper,
    beta_bad_cap:betaCap.toString(),
    alpha_bad_cap:alphaCap.toString(),
    // This enumerates base-field challenges only; extension version
    // relies on the algebraic polynomial root argument above.
    proof_of_full_plonky3_rbr_knowledge:false,
    pq128_demonstrated:false,
  });
}
