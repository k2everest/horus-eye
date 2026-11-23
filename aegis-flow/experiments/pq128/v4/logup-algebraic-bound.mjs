// Rigorous *interactive fixed-commitment* algebraic LogUp screening lemma.
// Does not analyze FS/QROM, hiding, FRI, witness extraction, or whole Aegis.
// A field challenge sampled after the fixed witness commitment is a strong
// hypothesis, not a consequence of the SHA-512 Fiat-Shamir implementation.
const BABY_BEAR_MODULUS=2013265921n;
const EXTENSION_DEGREE=8;
const MAX_GATES=8_000_000;
const MAX_WIRES=8_388_608;
const REQUIRED_ROWS=4096;
const bitLength=n=>n===0n?0:n.toString(2).length;
const integer=(x,min,max,name)=>{
  if(!Number.isSafeInteger(x)||x<min||x>max)
    throw new RangeError(name+' out of research profile bounds');
  return x;
};
export function inspectFixedInteractiveLogup({
  gates,wires,receipts=1n<<32n,segments=64
}={}){
  integer(gates,1,MAX_GATES,'gates');
  integer(wires,2,MAX_WIRES,'wires');
  integer(segments,1,64,'segments');
  if(typeof receipts!=='bigint'||receipts<1n||receipts>1n<<64n)
    throw new TypeError('bounded bigint receipts required');
  const t=3n*BigInt(gates)+BigInt(wires);
  // Each gate contributes exactly three multiset entries; every wire is
  // represented in the table with program-fixed use count, and inactive
  // gate rows have multiplicity zero. The field characteristic is larger
  // than the total count, preventing count aliasing modulo p.
  if(3n*BigInt(gates)>=BABY_BEAR_MODULUS)
    throw new RangeError('multiset multiplicity aliases modulo field');
  const rows=2**Math.ceil(Math.log2(Math.max(REQUIRED_ROWS,gates,wires)));
  if(rows>2**23)throw new RangeError('hiding-FRI domain insufficient');
  const fieldSize=BABY_BEAR_MODULUS**8n;
  // Condition on distinct compressed keys and a NONZERO multiset mismatch.
  // A pair of distinct (id,bit) tuples collides in id*beta+bit for
  // at most ONE beta, unless IDs coincide (then different bits never
  // collide). Union over <=t(t-1)/2 pairs.
  //
  // With no beta collisions, R(alpha) = sum_k d_k/(alpha-x_k) is a nonzero
  // rational function: clearing denominators gives a nonzero numerator
  // polynomial of degree <= (#unique_keys - 1) < t. There are <=t
  // forbidden poles; adding at most 2t is conservative.
  const pairCollisions=t*(t-1n)/2n;
  const alphaRootsAndPoles=2n*t;
  const numerator=pairCollisions+alphaRootsAndPoles;
  const unionMultiplier=receipts*BigInt(segments);
  const aggregateNumerator=unionMultiplier*numerator;
  return Object.freeze({
    schema:'AEGIS_V4_LOGUP_FIXED_INTERACTIVE_ALGEBRAIC_LEMMA_V1',
    model:'single-fixed-classical-commitment-then-independent-uniform-extension-field-alpha-beta',
    modulus:BABY_BEAR_MODULUS.toString(),
    extension_degree:EXTENSION_DEGREE,
    extension_field_cardinality:fieldSize.toString(),
    gates,wires,rows,
    multiset_size_upper_bound:t.toString(),
    field_tuple_collision_numerator:pairCollisions.toString(),
    field_alpha_roots_and_poles_numerator:alphaRootsAndPoles.toString(),
    conditional_single_proof_error_upper_bound:{
      numerator:numerator.toString(),denominator:fieldSize.toString(),
    },
    hypothetical_union_error_upper_bound:{
      numerator:aggregateNumerator.toString(),denominator:fieldSize.toString(),
    },
    classical_fixed_challenge_union_below_half:2n*aggregateNumerator<fieldSize,
    classical_fixed_challenge_union_below_2_minus_128:
      (aggregateNumerator<<128n)<=fieldSize,
    qrom_adaptive_security_proved:false,
    fiat_shamir_compiler_proved:false,
    lookup_transcript_independence_proved:false,
    full_logup_argument_soundness_proved:false,
    full_fri_soundness_proved:false,
    hash_idealization_proved:false,
    complete_financial_proof_passed:false,
    knowledge_soundness_proved:false,
    zero_knowledge_proved:false,
    aegis_target_met:false,production_ready:false,
    conclusion:'ALGEBRAIC_INTERACTIVE_COMPONENT_ONLY_NOT_PQ128',
  });
}
if(import.meta.url===new URL(import.meta.url).href&&process.argv[1]?.endsWith('logup-algebraic-bound.mjs')){
  const r=inspectFixedInteractiveLogup({gates:MAX_GATES,wires:MAX_WIRES});
  process.stdout.write(JSON.stringify(r,null,2)+'\n');
}
