// Conditional AIR-composition + quotient OOD lemma, NOT a Plonky3 proof.
// Models mathematical polynomials over F_p with BigInt exact arithmetic.
// Actual Plonky3 quotient is a composition with selectors, row shifts,
// LogUp permutation columns, and domain-split/recombined PCS chunks.
// Degree caps here are inputs to verify independently, never certified.
const invalid=m=>{throw new TypeError(m);};
const validPrime=p=>{
  if(typeof p!=='bigint'||p<5n||p>1000003n) return false;
  for(let i=2n;i*i<=p;i++)if(p%i===0n)return false;
  return true;
};
const normalize=(a,p)=>(a%p+p)%p;
const poly=(coeffs,p)=>{
  if(!Array.isArray(coeffs)||coeffs.length===0||coeffs.length>4096||
     !coeffs.every(x=>typeof x==='bigint')) invalid('NONCANONICAL_POLYNOMIAL');
  const a=coeffs.map(x=>normalize(x,p));
  while(a.length>1&&a.at(-1)===0n)a.pop();
  return a;
};
const mul=(a,b,p)=>{
  const out=Array(a.length+b.length-1).fill(0n);
  for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)
    out[i+j]=normalize(out[i+j]+a[i]*b[j],p);
  return poly(out,p);
};
const add=(a,b,p,sign=1n)=>{
  const out=Array(Math.max(a.length,b.length)).fill(0n);
  for(let i=0;i<out.length;i++)
    out[i]=normalize((a[i]??0n)+sign*(b[i]??0n),p);
  return poly(out,p);
};
const ev=(a,x,p)=>{
  let s=0n;
  for(let i=a.length-1;i>=0;i--)s=normalize(s*x+a[i],p);
  return s;
};
const pow=(a,n,p)=>{
  let z=1n,b=normalize(a,p);
  for(;n>0n;n>>=1n){if(n&1n)z=normalize(z*b,p);b=normalize(b*b,p);}
  return z;
};
const inv=(x,p)=>{
  const a=normalize(x,p);if(a===0n)invalid('ZERO_DENOMINATOR');
  return pow(a,p-2n,p);
};
const canonical=(p,coeffs)=>poly(coeffs,p);
const fieldCheck=p=>{if(!validPrime(p))invalid('PRIME_FIELD_REQUIRED');};
export function traceVanishingPolynomial(domainSize,prime){
  fieldCheck(prime);
  if(!Number.isSafeInteger(domainSize)||domainSize<1||domainSize>=Number(prime))
    invalid('INVALID_TRACE_DOMAIN_SIZE');
  // This polynomial assumes H = {x in Fp : x^N = 1}. For the
  // actual STARK, H must be the verifier-authenticated subgroup.
  const a=Array(domainSize+1).fill(0n);a[0]=prime-1n;a[domainSize]=1n;
  return Object.freeze(a);
}
/** divide by Z(X)=X^N-1 to test divisibility (quotient and remainder). */
export function divideByVanishing(coeffs,domainSize,prime){
  const z=traceVanishingPolynomial(domainSize,prime);
  const a=canonical(prime,coeffs);
  const q=Array(Math.max(1,a.length-domainSize)).fill(0n);
  const rem=[...a];
  for(let k=rem.length-1;k>=domainSize;k--){
    const v=rem[k];if(v===0n)continue;
    q[k-domainSize]=v;rem[k]=0n;
    rem[k-domainSize]=normalize(rem[k-domainSize]+v,prime);
  }
  return Object.freeze({
    quotient:Object.freeze(canonical(prime,q)),
    remainder:Object.freeze(canonical(prime,rem)),
    divisible:rem.every(x=>x===0n),
    vanishing:Object.freeze(z),
  });
}
/** The AIR constraints must be fixed as polynomials in X before alpha.
 * A single offending row x in the trace domain gives a nonzero
 * polynomial in alpha with degree <= m-1.
 */
export function compositionAtWitnessRow({
  prime,componentValues,alpha,
}={}){
  fieldCheck(prime);
  if(!Array.isArray(componentValues)||!componentValues.length||
     componentValues.length>4096||
     !componentValues.every(x=>typeof x==='bigint'))invalid('COMPONENTS_REQUIRED');
  if(typeof alpha!=='bigint')invalid('CHALLENGE_REQUIRED');
  const fixed=canonical(prime,componentValues);
  const witnessViolation=fixed.some(x=>x!==0n);
  return Object.freeze({
    schema:'AEGIS_ALI_FIXED_CONSTRAINT_COMPOSITION_RESEARCH_V1',
    component_count:componentValues.length,
    any_constraint_violated_at_fixed_trace_row:witnessViolation,
    combined_residual_at_challenge:ev(fixed,normalize(alpha,prime),prime).toString(),
    exceptional_alpha_count_at_most:witnessViolation?fixed.length-1:0,
    probability_if_uniform_extension_challenge:Object.freeze({
      numerator:String(witnessViolation?fixed.length-1:0),
      denominator:'p^d',
    }),
    all_trace_rows_checked:false,
    rbr_knowledge_proved:false,pq128_demonstrated:false,
  });
}
/** Given full fixed polynomials C(X), Q(X), test P=C-Z*Q.
 * If P!=0, at most deg(P) roots in extension E=GF(p^d).
 * Require Q fixed BEFORE zeta, and witness claims fixed BEFORE alpha.
 * This does not include PCS/FRI authentication of C or Q.
 */
export function quotientOodMismatch({
  prime,domainSize,constraintPolynomial,quotientPolynomial,extensionDegree=8,
}={}){
  fieldCheck(prime);
  if(!Number.isSafeInteger(extensionDegree)||extensionDegree<1||extensionDegree>32)
    invalid('INVALID_EXTENSION_DEGREE');
  const C=canonical(prime,constraintPolynomial),Q=canonical(prime,quotientPolynomial);
  const Z=traceVanishingPolynomial(domainSize,prime);
  const residual=add(C,mul(Z,Q,prime),prime,-1n);
  const isZero=residual.length===1&&residual[0]===0n;
  const degree=isZero?-1:residual.length-1;
  const denominator=prime**BigInt(extensionDegree);
  const numerator=isZero?0n:BigInt(degree);
  const division=divideByVanishing(C,domainSize,prime);
  return Object.freeze({
    schema:'AEGIS_OOD_FIXED_POLYNOMIAL_IDENTITY_RESEARCH_V1',
    trace_domain_size:domainSize,
    constraint_degree:C.length-1,
    quotient_degree:Q.length-1,
    residual_degree:degree,
    residual_identically_zero:isZero,
    constraint_divisible_by_vanishing:division.divisible,
    quotient_is_exact_polynomial:division.divisible&&
      division.quotient.length===Q.length&&
      division.quotient.every((x,i)=>x===Q[i]),
    conditional_uniform_extension_zeta_bound:Object.freeze({
      numerator:numerator.toString(),denominator:denominator.toString(),
      warning:'counts a zero of P; zeta on H must be separately rejected',
    }),
    actual_trace_domain_authenticated:false,
    polynomial_degree_commitment_verified:false,
    quotient_fixed_before_zeta_verified:false,
    FRI_opening_binding_proved:false,
    AIR_LogUp_knowledge_soundness_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
/** Finite field exhaustive diagnostic. Zeta in H is rejected, so the
 * numerator counts only roots outside H. Never evidence of FRI binding.
 */
export function enumerateOodChecks({
  prime,domainSize,constraintPolynomial,quotientPolynomial,
}={}){
  const theorem=quotientOodMismatch({prime,domainSize,
    constraintPolynomial,quotientPolynomial,extensionDegree:1});
  const C=canonical(prime,constraintPolynomial);
  const Q=canonical(prime,quotientPolynomial);
  const N=BigInt(domainSize),H=[];
  for(let x=0n;x<prime;x++)if(pow(x,N,prime)===1n)H.push(x.toString());
  if(H.length!==domainSize)invalid('NOT_A_VALID_TRACE_SUBGROUP');
  const domain=new Set(H);
  let validZeta=0,rootCount=0,passes=0;
  for(let x=0n;x<prime;x++){
    if(domain.has(x.toString()))continue;
    validZeta++;
    const mismatch=normalize(ev(C,x,prime)-(pow(x,N,prime)-1n)*ev(Q,x,prime),prime);
    if(mismatch===0n){rootCount++;passes++;}
  }
  const finiteUpper=theorem.residual_identically_zero
    ?validZeta:Math.max(0,theorem.residual_degree);
  return Object.freeze({
    schema:'AEGIS_OOD_EXHAUSTIVE_BASE_FIELD_DIAGNOSTIC_V1',
    actual_subgroup_size:H.length,outside_subgroup_count:validZeta,
    exceptional_roots:rootCount,roots_bounded_by_polynomial_degree:rootCount<=finiteUpper,
    accepted_outside_domain_points:passes,
    lower_probability_conditioned_on_outside_domain:
      validZeta>0?Object.freeze({numerator:String(rootCount),denominator:String(validZeta)}):null,
    theorem,
    quantum_knowledge_proved:false,pq128_demonstrated:false,
  });
}
