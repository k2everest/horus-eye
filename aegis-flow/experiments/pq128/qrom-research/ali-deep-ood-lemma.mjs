// PQ128 research-only conditional ALI/DEEP identity lemma.
// For FIXED coherent polynomials before zeta, if D(X)=C_alpha(X)-Z_H(X)Q(X)
// is nonzero of degree <=Dmax then Pr[D(zeta)=0]<=Dmax/|E|.
// The p3-batch-stark verifier evaluates the actual identity with
// first/last/transition selectors and lookup constraints. This module
// does NOT reconstruct or prove the degrees of those concrete polynomials.
const P=2013265921n;
const validInt=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const reject=m=>{throw new RangeError(m);};
const pow=(a,k)=>a**BigInt(k);
const capFraction=(num,den)=>({
  numerator:(num<den?num:den).toString(),denominator:den.toString(),
});
const log2Big=n=>{
  if(n<=0n)return -Infinity;
  const bits=n.toString(2).length,shift=Math.max(0,bits-53);
  return Math.log2(Number(n>>BigInt(shift)))+shift;
};

/** Symbolic budget, degrees are ASSUMPTIONS until measured and proven.
 * m constraints folded using independently uniform rho; invalid means
 * some component C_j nonzero on H. Sampling rho can cancel that row
 * with probability at most (m-1)/|E|, if powers are distinct and the
 * actual folding implementation corresponds to C_rho=sum rho^j C_j.
 *
 * After quotient commitment, sample independent uniform zeta. Nonzero
 * D_rho=C_rho-Z_H Q has at most max(deg C_rho, N+deg Q) roots.
 * If zeta in H causes an abort, count N points separately, conservatively.
 * This DOES NOT bound the actual FRI/PCS opening or commitment extraction.
 */
export function conditionalAliDeepBudget({
  traceRows,constraintCount,foldedConstraintDegreeCeiling,
  quotientDegreeCeiling,extensionDegree=8,
}={}){
  if(!validInt(traceRows,2,1<<23)||!validInt(constraintCount,1,100_000_000)||
     !validInt(foldedConstraintDegreeCeiling,0,1<<30)||
     !validInt(quotientDegreeCeiling,0,1<<30)||
     !validInt(extensionDegree,1,32)||
     (traceRows&(traceRows-1))!==0)reject('UNPROVED_OR_INVALID_DEGREE_INPUT');
  const field=pow(P,extensionDegree);
  const badCombination=BigInt(constraintCount-1);
  const maxDiscrepancyDegree=BigInt(Math.max(
    foldedConstraintDegreeCeiling,traceRows+quotientDegreeCeiling));
  const domainHits=BigInt(traceRows);
  const numerator=badCombination+maxDiscrepancyDegree+domainHits;
  return Object.freeze({
    schema:'AEGIS_V5_ALI_DEEP_FIXED_ORACLE_CONDITIONAL_V1',
    prime:P.toString(),extension_degree:extensionDegree,
    trace_rows:traceRows,
    constraint_count_assumed:constraintCount,
    folded_constraint_degree_ceiling_assumed:foldedConstraintDegreeCeiling,
    quotient_degree_ceiling_assumed:quotientDegreeCeiling,
    algebraic_bad_composition_count:badCombination.toString(),
    algebraic_ood_roots_count:maxDiscrepancyDegree.toString(),
    conservative_domain_hit_count:domainHits.toString(),
    union_bound:capFraction(numerator,field),
    conditional_security_bits:log2Big(field)-log2Big(numerator),
    commitments_precede_sampling_assumed:true,
    quotient_is_fixed_before_zeta_assumed:true,
    verifier_owned_degree_constraints_proved:false,
    verifier_owned_trace_and_quotient_oracles_extracted:false,
    exact_plonky3_selectors_equivalence_proved:false,
    constraint_power_layout_matches_simple_polynomial_proved:false,
    ood_independence_and_distribution_proved:false,
    fri_merkle_openings_authenticated_proved:false,
    round_by_round_knowledge_proved:false,
    qrom_proved:false,pq128_demonstrated:false,production_ready:false,
  });
}

const mod=(a,p)=>(a%p+p)%p;
const mulMod=(a,b,p)=>mod(a*b,p);
const polyTrim=a=>{let end=a.length;while(end>0&&a[end-1]===0n)end--;return a.slice(0,end)};
const validateCoefficients=(a,p)=>{
  if(!Array.isArray(a)||a.length>64||
    a.some(x=>typeof x!=='bigint'||x<0n||x>=p))
    throw new TypeError('INVALID_CANONICAL_POLYNOMIAL');
  return polyTrim(a);
};
const polyAdd=(a,b,p)=>{
  const r=Array(Math.max(a.length,b.length)).fill(0n);
  for(let i=0;i<r.length;i++)r[i]=mod((a[i]??0n)+(b[i]??0n),p);
  return polyTrim(r);
};
const polySub=(a,b,p)=>polyAdd(a,b.map(x=>mod(-x,p)),p);
const polyMul=(a,b,p)=>{
  if(!a.length||!b.length)return [];
  const r=Array(a.length+b.length-1).fill(0n);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)
    r[i+j]=mod(r[i+j]+mulMod(a[i],b[j],p),p);
  return polyTrim(r);
};
const evalPoly=(a,x,p)=>a.reduceRight((acc,c)=>mod(acc*x+c,p),0n);
const exponent=(x,n,p)=>{
  let a=mod(x,p),r=1n;
  for(let k=BigInt(n);k>0n;k>>=1n){if(k&1n)r=mod(r*a,p);a=mod(a*a,p);}
  return r;
};
const degree=p=>p.length-1;
const rootsOfUnity=(n,p)=>{
  const roots=[];
  for(let i=0n;i<p;i++)if(exponent(i,n,p)===1n)roots.push(i);
  if(roots.length!==n)reject('NO_EXACT_SUBGROUP');
  return roots;
};
const randomFold=(constraints,rho,p)=>{
  let acc=[],power=1n;
  for(const c of constraints){
    acc=polyAdd(acc,c.map(v=>mulMod(v,power,p)),p);
    power=mod(power*rho,p);
  }
  return acc;
};
const nonzeroOnDomain=(constraints,H,p)=>H.some(h=>
  constraints.some(c=>evalPoly(c,h,p)!==0n));

/** For a small prime, exhaust ALL rho,zeta pairs, while the adversary
 * may choose each quotient Q_rho AFTER seeing rho but BEFORE zeta.
 * The callback receives rho alone, never zeta.
 */
export function exhaustiveAliDeepToy({
  prime,traceRows,constraints,chooseQuotient,
}={}){
  if(!validInt(prime,5,257)||!validInt(traceRows,2,32)||
     (prime-1)%traceRows!==0||
     !Array.isArray(constraints)||constraints.length<1||constraints.length>16||
     typeof chooseQuotient!=='function')reject('INVALID_TOY_ALI_INSTANCE');
  for(let d=2;d*d<=prime;d++)if(prime%d===0)reject('NONPRIME_FIELD');
  const p=BigInt(prime),n=traceRows,H=rootsOfUnity(n,p);
  const C=constraints.map(c=>validateCoefficients(c,p));
  if(!nonzeroOnDomain(C,H,p))reject('ALL_CONSTRAINTS_ALREADY_VALID');
  const Z=Array(n+1).fill(0n);Z[0]=p-1n;Z[n]=1n;
  let foldingCancellation=0,badZeta=0,oodRoots=0,degreeBoundObserved=0;
  let outOfDomainTrials=0,acceptedOutside=0;
  for(let rho=0;rho<prime;rho++){
    const rhoBig=BigInt(rho);
    const folded=randomFold(C,rhoBig,p);
    const Q=validateCoefficients(chooseQuotient(rhoBig),p);
    const foldedIsInvalid=H.some(h=>evalPoly(folded,h,p)!==0n);
    if(!foldedIsInvalid)foldingCancellation++;
    const D=polySub(folded,polyMul(Z,Q,p),p);
    if(foldedIsInvalid&&D.length===0)throw new Error('INVALID_TRACE_DIVISIBLE_BY_Z');
    const bound=Math.max(degree(folded),n+degree(Q));
    degreeBoundObserved=Math.max(degreeBoundObserved,bound);
    let countRoots=0;
    for(let zeta=0;zeta<prime;zeta++){
      const x=BigInt(zeta);
      if(exponent(x,n,p)===1n){badZeta++;continue;}
      outOfDomainTrials++;
      if(evalPoly(D,x,p)===0n){acceptedOutside++;countRoots++;}
    }
    if(foldedIsInvalid && countRoots>degree(D))
      throw new Error('VIOLATED_POLYNOMIAL_ROOT_BOUND');
    if(foldedIsInvalid)oodRoots=Math.max(oodRoots,countRoots);
  }
  const badCompositionCap=constraints.length-1;
  const maxRootsPerGoodRho=degreeBoundObserved;
  const unionCap=(badCompositionCap+traceRows+maxRootsPerGoodRho)*prime;
  const observedBad=BigInt(acceptedOutside);
  return Object.freeze({
    schema:'AEGIS_TOY_ALI_DEEP_EXHAUSTIVE_VALIDATION_V1',
    full_pair_count:prime*prime,
    invalid_witness_fixed_before_composition:true,
    quotient_may_adapt_to_rho_but_not_zeta:true,
    folding_cancellation_rho_count:foldingCancellation,
    folding_cancellation_at_most:badCompositionCap,
    ood_domain_hits:badZeta,
    max_ood_roots_for_nonzero_discrepancy:oodRoots,
    observed_acceptances_outside_domain:acceptedOutside,
    valid_ood_trials:outOfDomainTrials,
    union_bound_conservative_compatible:observedBad<=BigInt(unionCap),
    root_bound_checked_for_all_rho:true,
    toy_field_only:true,
    real_wired_air_knowledge_proved:false,qrom_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
