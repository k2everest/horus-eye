// Exact, conditional screening of the *standalone* FRI/BCS constructions in
// BGKTTZ23 Theorem 6 and the finite soundness derivation of CMS19 section 8.5.1.
// Not a prover, not an analysis of RISC Zero/Plonky3, not a ZK/knowledge proof.
const P = (1n << 64n) - (1n << 32n) + 1n;
const gcd = (a,b) => { while(b) [a,b]=[b,a%b]; return a; };
function fraction(n,d) { const g=gcd(n,d); return {n:n/g,d:d/g}; }
const add = (a,b) => fraction(a.n*b.d+b.n*a.d,a.d*b.d);
const scale = (a,n) => fraction(a.n*n,a.d);
const max = (a,b) => a.n*b.d >= b.n*a.d ? a : b;
const json = a => ({numerator:a.n.toString(),denominator:a.d.toString()});
function integer(n,min,max) { if(!Number.isSafeInteger(n)||n<min||n>max) throw new TypeError('invalid screening parameter'); }
function count(n,min=0n) { if(typeof n!=='bigint'||n<min||n>=(1n<<4096n)) throw new TypeError('invalid query count'); }

export function screenStandaloneFri({domainLog2=16,queries=720,hashBits=512,
  adversaryQueries=1n<<128n,verificationHashCalls=1_000_000n,expandedPairs=1_000_000n,
  instances=64,targetFailureBits=1}={}) {
  integer(domainLog2,2,32);integer(queries,1,16384);integer(hashBits,1,4096);
  integer(instances,1,1_000_000);integer(targetFailureBits,1,4096);
  count(adversaryQueries,1n);count(verificationHashCalls);count(expandedPairs);
  // Goldilocks^5 cardinality; the base field has a multiplicative subgroup of
  // order 2^n for n<=32. This does not instantiate a prover/extension polynomial.
  const fieldSize=P**5n,domainSize=1n<<BigInt(domainLog2);
  // Specialize Theorem 6: rho=1/4, m=3, eta=1/16, delta=1/4.
  // (m+1/2)^7 / (3 rho^(3/2)) = 7^7/48, exactly (not rounded down).
  const algebraic=fraction(7n**7n*domainSize**2n,48n*fieldSize);
  const sampling=fraction(3n**BigInt(queries),4n**BigInt(queries));
  const rbr=max(algebraic,sampling);
  const t=adversaryQueries+verificationHashCalls;
  const hashSpace=1n<<BigInt(hashBits);
  // CMS19: database bound x=6(t^2 epsilon+4t^3/2^lambda).
  // Lemma 4.9: oracle bound <= (sqrt(x)+sqrt(a/2^lambda))^2
  // <= 2x+2a/2^lambda. Use that looser bound to keep all arithmetic exact.
  const reduction=scale(rbr,12n*t*t);
  const collisions=fraction(48n*t*t*t,hashSpace);
  const extraction=fraction(2n*expandedPairs,hashSpace);
  const union=scale(add(add(reduction,collisions),extraction),BigInt(instances));
  const bounded=union.n>union.d?{n:1n,d:1n}:union;
  return {
    schema:'AEGIS_STANDALONE_FRI_QROM_SCREEN_V1',
    scope:'conditional fixed-statement soundness of the specified standalone FRI/BCS construction in an ideal quantum random oracle; not Aegis transaction security',
    parameters:{field_prime:P.toString(),extension_degree:5,domain_log2:domainLog2,
      rate:'1/4',m:3,eta:'1/16',delta:'1/4',queries,hash_output_bits:hashBits,
      adversary_queries:adversaryQueries.toString(),assumed_verification_hash_calls:verificationHashCalls.toString(),
      assumed_expanded_pairs:expandedPairs.toString(),instances,target_failure_negative_log2:targetFailureBits},
    round_by_round_error:{algebraic:json(algebraic),sampling:json(sampling),maximum:json(rbr)},
    quantum_error_terms:{rbr_reduction:json(reduction),hash_collisions:json(collisions),expansion:json(extraction)},
    conditional_failure_upper_bound:json(bounded),
    conditional_inequality_holds:bounded.n*(1n<<BigInt(targetFailureBits))<=bounded.d,
    aegis_target_met:false,production_ready:false,
    obligations:[
      'Implement and match the exact FRI proximity test and BCS compiler/transcript of the cited theorems; this calculator implements neither.',
      'Discharge delta-farness and round-by-round hypotheses for the financial AIR; standalone FRI is not a proof of transaction validity.',
      'Implement an irreducible extension and evaluation domain; sample field challenges uniformly and account for rejection/abort and oracle calls. A raw 512-bit digest modulo the field size is not uniform.',
      'Measure and enforce verification/expansion bounds, domain size and every accepted proof parameter; counts above are assumptions, not measurements.',
      'Analyze adaptive statements, knowledge extraction, masking/zero knowledge and all application bindings and compositions separately.',
      'Justify the SHA-512 instantiation of the ideal oracle, and obtain independent review of argument and implementation.',
    ],
  };
}
