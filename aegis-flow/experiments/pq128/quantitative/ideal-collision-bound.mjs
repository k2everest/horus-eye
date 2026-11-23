// CMS19 Lemmas 5.13/4.9 specialized to the collision database property:
// I(P_col,t) < t/N; P_DB <= 6t^3/N; P_oracle <= 12t^3/N+4/N.
// Two extra hash queries let a wrapper verify the two claimed openings.
// Only a uniformly sampled binary-output quantum random oracle is modeled.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const frac=(n,d)=>{const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
export function idealCollisionBound({outputBits=512,adversaryQueries=1n<<128n,candidatePairs=1n<<34n}={}){
  if(!Number.isSafeInteger(outputBits)||outputBits<1||outputBits>4096)throw new TypeError('invalid binary oracle output size');
  for(const n of [adversaryQueries,candidatePairs])if(typeof n!=='bigint'||n<0n||n>=(1n<<4096n))throw new TypeError('bounded bigint query/pair counts required');
  const t=adversaryQueries+2n,N=1n<<BigInt(outputBits);
  const numerator=candidatePairs*(12n*t*t*t+4n);
  return {
    schema:'AEGIS_IDEAL_HASH_COLLISION_BOUND_V1',
    scope:'conditional-collision-resistance-in-the-binary-quantum-random-oracle-model',
    parameters:{output_bits:outputBits,adversary_queries_global:adversaryQueries.toString(),candidate_pairs:candidatePairs.toString(),t:t.toString()},
    conditional_collision_probability_upper_bound:frac(numerator>N?N:numerator,N),
    conditional_bound_at_most_half:numerator*2n<=N,
    assumptions:[
      'The hash is a uniformly sampled binary-output quantum random oracle. This does not establish a property of concrete SHA-512 or Poseidon2.',
      'The adversary uses at most the GLOBAL query budget and outputs at most the stated number of candidate pairs. A wrapper for each output pair spends two additional queries.',
      'Each fixed output selector is itself a global-budget oracle adversary, so a union over output pairs needs no independence. This is not a transfer of a fixed-statement FRI theorem to adaptive proof instances.',
      'Distinct canonical financial note encodings with equal commitments imply a hash collision; encoding injectivity must hold for the relation being analyzed.',
    ],
    concrete_sha512_security_demonstrated:false,aegis_target_met:false,production_ready:false,
  };
}
