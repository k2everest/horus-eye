// Necessary entropy-sizing screen for salted Merkle inputs.
// This is an idealized single-target unstructured-search bound, NOT a
// quantum security proof of MerkleTreeHidingMmcs, the STARK, or SHA-512.
const P=2013265921n;
export function screenQuantumSaltSearch({
  salts=16,queries=1n<<128n,receipts=1n<<32n,
  segments=64,eventFamilies=4,residualBits=128,
}={}){
  for(const [x,low,high,k] of [
    [salts,1,128,'salts'],[segments,1,64,'segments'],
    [eventFamilies,1,64,'eventFamilies'],
    [residualBits,1,512,'residualBits'],
  ])if(!Number.isSafeInteger(x)||x<low||x>high)
    throw new RangeError('invalid '+k);
  for(const [x,k] of [[queries,'queries'],[receipts,'receipts']])
    if(typeof x!=='bigint'||x<1n||x>1n<<256n)
      throw new TypeError('invalid '+k);
  const space=P**BigInt(salts);
  const events=receipts*BigInt(segments)*BigInt(eventFamilies);
  // For a uniformly distributed independently targetable secret in a
  // |S|-element unstructured domain, a conservative Grover-search upper
  // bound per target is (2Q+1)^2/|S|. The event multiplier is a
  // hypothetical ordinary union bound; it does not establish independent
  // targets, simulation security or the actual MMCS hiding theorem.
  const numerator=events*(2n*queries+1n)**2n;
  const stronger=numerator*(1n<<BigInt(residualBits));
  return Object.freeze({
    schema:'AEGIS_V4_QUANTUM_SALT_ENTROPY_CONDITIONAL_SCREEN_V1',
    field_modulus:P.toString(),salt_elements:salts,
    salt_uniform_space:space.toString(),
    event_budget:events.toString(),
    qrom_oracle_queries:queries.toString(),
    generic_search_upper_bound:{
      numerator:numerator.toString(),denominator:space.toString(),
    },
    conditional_success_below_half:2n*numerator<=space,
    conditional_residual_target_met:stronger<=space,
    assumptions:[
      'salt elements independent uniformly random in BabyBear',
      'adversary event is reducible to recovering one isolated salt by unstructured search',
      'valid first-bad-event reduction to bounded events',
      'fixed query budget shared between all candidate targets',
    ],
    salt_hiding_proved:false,
    full_merkle_binding_proved:false,
    fiat_shamir_qrom_proved:false,
    aegis_target_met:false,production_ready:false,
  });
}
