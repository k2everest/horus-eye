// Reproducible comparison against p3-baby-bear, p3-koala-bear and
// p3-goldilocks v0.8.0's extension implementations. Native support is
// read from the exact pinned version, not guessed from field cardinality.
import {irreducibilityCertificate} from './babybear16-reference.mjs';
const profiles=[
 {id:'babybear8',prime:2013265921n,degree:8,native_support:true,serialization_bytes:32,source:'baby-bear/src/baby_bear.rs'},
 {id:'babybear5',prime:2013265921n,degree:5,native_support:true,serialization_bytes:20,source:'baby-bear/src/baby_bear.rs'},
 {id:'koalabear8',prime:2130706433n,degree:8,native_support:true,serialization_bytes:32,source:'koala-bear/src/koala_bear.rs'},
 {id:'goldilocks5',prime:18446744069414584321n,degree:5,native_support:true,serialization_bytes:40,source:'goldilocks/src/extension.rs'},
 {id:'goldilocks2',prime:18446744069414584321n,degree:2,native_support:true,serialization_bytes:16,source:'goldilocks/src/extension.rs'},
 {id:'babybear16-candidate',prime:2013265921n,degree:16,native_support:false,serialization_bytes:64,source:'v5/babybear16-reference.mjs'},
];
export function compareFieldProfiles({algebraicRbrTargetBits=336,lookupNumeratorBits=27}={}){
 if(!Number.isSafeInteger(algebraicRbrTargetBits)||algebraicRbrTargetBits<1||
    !Number.isSafeInteger(lookupNumeratorBits)||lookupNumeratorBits<0)
    throw new RangeError('invalid soundness target');
 const candidateCert=irreducibilityCertificate();
 return Object.freeze({
  schema:'AEGIS_V5_CHALLENGE_FIELD_COMPARISON_V1',
  plonky3_version:'0.8.0',
  expected_interactive_rbr_target_bits:algebraicRbrTargetBits,
  logup_profile: '4 interactions, 2-element message, 2^23 trace rows',
  profiles:profiles.map(x=>{
   const fieldBits=Math.log2(Number(x.prime))*x.degree;
   const logupBits=fieldBits-lookupNumeratorBits;
   return Object.freeze({
    name:x.id,prime:x.prime.toString(),degree:x.degree,
    field_cardinality:(x.prime**BigInt(x.degree)).toString(),
    field_bits:fieldBits,logup_algebraic_bits_at_worst_case:logupBits,
    margin_over_target_bits:logupBits-algebraicRbrTargetBits,
    native_plonky3_extension_available:x.native_support,
    candidate_irreducibility_certified:x.id==='babybear16-candidate'&&candidateCert.criterion_proved,
    serialized_bytes:x.serialization_bytes,source:x.source,
    pq128_demonstrated:false,
   });
  }),
  selected_for_native_implementation:'babybear16-candidate',
  selected_native_ready:false,
  pcs_compatibility_proved:false,
  qrom_full_proof_demonstrated:false,
  production_ready:false,
 });
}
