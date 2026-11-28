// Standalone mathematical certificate for a potential
// p3-baby-bear::BinomialExtensionData<16> implementation.
//
// E16 := F_p[t] / (t^16-11), p=2013265921. Irreducibility and
// field embedding are separately proved/tested. Since t^16=11 has
// v2(ord(t))=31 and v2(p^16-1)=31, the following monomials
// have exact 2^j order, for j=28,29,30,31.
// This DOES NOT implement a native p3 Field trait or provide a
// cryptographically validated full multiplicative generator.
const P=2013265921n,DEGREE=16n,W=11n;
const requireTrue=(condition,m)=>{if(!condition)throw Error('E16_TWO_ADIC_'+m);};
function modPow(base,exp,mod=P){
  let result=1n,a=base%mod,n=exp;
  requireTrue(n>=0n,'NEGATIVE_EXPONENT');
  for(;n>0n;n>>=1n){
    if(n&1n)result=result*a%mod;
    a=a*a%mod;
  }
  return result;
}
const monomial=(index,coefficient)=>Object.freeze({index,coefficient});
const one=()=>monomial(0,1n);
function multiplyMonomial(a,b){
  const i=a.index+b.index;
  return monomial(i%16,a.coefficient*b.coefficient*
    (i>=16?W:1n)%P);
}
function monomialPower(x,exp){
  let result=one(),a=x,n=exp;
  for(;n>0n;n>>=1n){
    if(n&1n)result=multiplyMonomial(result,a);
    a=multiplyMonomial(a,a);
  }
  return result;
}
const equal=(a,b)=>a.index===b.index&&a.coefficient===b.coefficient;
export function babyBear16TwoAdicCertificate(){
  const groupOrder=P**DEGREE-1n;
  let odd=groupOrder,valuation=0;
  while(odd%2n===0n){odd>>=1n;valuation++;}
  requireTrue(valuation===31,'ORDER_VALUATION');
  const baseTwoAdicity=27;
  const dthRoot=modPow(W,(P-1n)/DEGREE);
  requireTrue(modPow(W,(P-1n)/2n)===P-1n,'NONRESIDUE');
  requireTrue(modPow(dthRoot,16n)===1n,'DTH_ROOT_ORDINAL');
  requireTrue(modPow(dthRoot,8n)===P-1n,'DTH_ROOT_PRIMITIVITY');
  const generators=[];
  for(let bits=baseTwoAdicity+1;bits<=valuation;bits++){
    const exp=groupOrder/(2n**BigInt(bits));
    const root=monomial(Number(exp%DEGREE),modPow(W,exp/DEGREE));
    requireTrue(equal(monomialPower(root,2n**BigInt(bits)),one()),
      'ROOT_ORDER_UPPER_'+bits);
    requireTrue(!equal(monomialPower(root,2n**BigInt(bits-1)),one()),
      'ROOT_ORDER_LOWER_'+bits);
    generators.push(Object.freeze({
      bits,
      canonical_basis_coefficient_index:root.index,
      canonical_basis_coefficient:Number(root.coefficient),
      order_verified:true,
    }));
  }
  requireTrue(generators.every((v,i)=>i===0||
    generators[i-1].bits+1===v.bits),'GENERATOR_SEQUENCE');
  return Object.freeze({
    schema:'AEGIS_BABYBEAR16_TWO_ADIC_CERTIFICATE_V1',
    base_prime:Number(P),
    polynomial:'X^16-11',
    degree:16,
    total_two_adicity:valuation,
    base_field_two_adicity:baseTwoAdicity,
    dth_root:Number(dthRoot),
    extension_generators:Object.freeze(generators),
    canonical_monomial_encoding_checked:true,
    exact_2_adic_orders_verified:true,
    full_multiplicative_generator_verified:false,
    native_binomial_extension_data_16_implemented:false,
    native_challenger_sampling_verified:false,
    fri_pcs_proof_compatibility_verified:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
