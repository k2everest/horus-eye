// Algebraically proven degree-16 extension CANDIDATE for a future
// PQ128 profile, not an implemented Plonky3 0.8.0 field/PCS.
// BabyBear p-1=15*2^27, and 11 is a quadratic nonresidue.
// Thus X^16-11 is irreducible by the 2-adic multiplicative-order proof.
const p=2013265921n;
const modexp=(base,exponent)=>{
  let a=((base%p)+p)%p,r=1n,n=exponent;
  if(n<0n)throw Error('NEGATIVE_EXPONENT');
  while(n>0n){if(n&1n)r=r*a%p;a=a*a%p;n>>=1n;}
  return r;
};
const twos=n=>{
  let count=0,value=n;
  while(value>0n&&value%2n===0n){value/=2n;count++;}
  return {power:count,odd:value};
};
export function evaluateBabyBearDegree16(w=11){
  if(!Number.isSafeInteger(w)||w<=0||w>=Number(p))
    throw new TypeError('INVALID_EXTENSION_NONRESIDUE');
  const decomposition=twos(p-1n);
  const isNonsquare=modexp(BigInt(w),(p-1n)/2n)===p-1n;
  // For non-square w, v2(ord(w))=v2(p-1)=27.
  // If alpha^16=w, then v2(ord(alpha))=31. Since F_p is
  // 1 mod 4 and v2(p^d-1)=27+v2(d), alpha cannot live
  // in an extension degree d<16 dividing 16. Therefore
  // the minimal polynomial X^16-w has degree exactly 16.
  const proven=decomposition.power===27&&
    decomposition.odd===15n&&isNonsquare;
  return Object.freeze({
    schema:'AEGIS_BABYBEAR16_ALGEBRAIC_CANDIDATE_V1',
    prime:Number(p),field_characteristic_prime_already_pinned:true,
    polynomial:`X^16 - ${w}`,
    nonresidue:w,
    legendre_symbol:isNonsquare?-1:1,
    base_field_two_adic_order:decomposition.power,
    base_field_odd_order:Number(decomposition.odd),
    irreducibility_by_multiplicative_order_proved:proven,
    degree:16,
    extension_field_bits:16*Math.log2(Number(p)),
    pinned_plonky3_0_8_extension_16_implemented:false,
    pinned_native_field_degree:8,
    native_field_migration_tested:false,
    extension_arithmetic_tested:false,
    extension_serialization_tested:false,
    pcs_fri_logup_compatible_proved:false,
    fiat_shamir_qrom_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
