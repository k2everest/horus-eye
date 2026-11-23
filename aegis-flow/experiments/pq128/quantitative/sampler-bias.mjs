// Exact classical distribution calculation under iid uniform draws. It does
// not establish that the concrete Poseidon2 sponge supplies independent draws,
// and it is not a QROM grinding/forgery bound or a claim of quantum bits.
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
const frac=(n,d)=>{const g=gcd(n,d);return {numerator:(n/g).toString(),denominator:(d/g).toString()};};
function integer(n,min,max){if(!Number.isSafeInteger(n)||n<min||n>max)throw new TypeError('invalid sampler parameter');}
function count(n,min=0n){if(typeof n!=='bigint'||n<min||n>=(1n<<4096n))throw new TypeError('bounded bigint required');}

// General numerical helper for validation with small, exhaustively enumerable
// ranges. Primality is not asserted or needed for this counting identity.
export function firstNonzeroResidueBias({prime,draws,bits}){
  count(prime,3n);integer(draws,1,16);integer(bits,1,32);
  const residues=1n<<BigInt(bits);
  if((prime-1n)%residues!==0n)throw new TypeError('nonzero range must divide into complete residue classes');
  return frac(residues-1n,residues*prime**BigInt(draws));
}

export function idealRisc0SamplerBias({queryBits=26,queries=50n,segments=64n,receipts=1n}={}){
  integer(queryBits,1,27);for(const n of [queries,segments,receipts])count(n);
  const prime=2013265921n,draws=4;
  const perQuery=firstNonzeroResidueBias({prime,draws,bits:queryBits});
  const n=BigInt(perQuery.numerator),d=BigInt(perQuery.denominator),samples=queries*segments*receipts;
  const total=n*samples;
  return {
    schema:'AEGIS_IDEAL_RISC0_SAMPLER_DISTANCE_V1',
    scope:'conditional-classical-total-variation-under-iid-uniform-draws',
    parameters:{prime:prime.toString(),draws,query_bits:queryBits,queries:queries.toString(),segments:segments.toString(),receipts:receipts.toString(),samples:samples.toString()},
    per_query_total_variation:perQuery,
    classical_iid_union_total_variation_upper_bound:frac(total>d?d:total,d),
    assumptions:[
      'Each sample uses four independent uniformly distributed cells in the base range [0,p). This is an assumption, not a property established for the concrete sponge.',
      'The first nonzero cell is kept; after four zeros the result is zero. Masking to b low bits is evaluated only when 2^b divides p-1.',
      'The union is a classical distribution-distance calculation under the stated ideal-draw hypothesis. Adaptive quantum oracle access, grinding, transcript correlations and proof soundness require separate reductions.',
    ],
    demonstrated_post_quantum_bits:null,aegis_target_met:false,production_ready:false,
  };
}
