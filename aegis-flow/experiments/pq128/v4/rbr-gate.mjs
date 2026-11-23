// AEGIS V4 M1 research-only assessment, not consensus or a crypto theorem.
// Reads p3-security's actual AIR-shaped *interactive RBR* diagnostic.
// The report is an unauthenticated artifact of a local lab build and is
// NEVER proof of post-quantum Fiat-Shamir, witness knowledge or privacy.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const integer=(value,name,min,max)=>{
  if(!Number.isSafeInteger(value)||value<min||value>max)
    throw new TypeError('invalid '+name);
  return value;
};
const logCeil=n=>n<=1n?0:(n-1n).toString(2).length;
export function assessV4Rbr(report,{receipts=1n<<32n,maxSegments=64,
  residualBits=128}={}){
  if(!report||report.schema!=='AEGIS_V4_PLONKY3_RBR_LAB_REPORT_V1')
    throw new TypeError('pinned native Plonky3 security report required');
  if(typeof receipts!=='bigint'||receipts<1n||receipts>1n<<64n)
    throw new TypeError('bounded receipt count required');
  integer(maxSegments,'segment count',1,64);
  integer(residualBits,'residual bits',1,256);
  const fields={
    challenge_extension_degree:8,log_blowup:3,fri_queries:320,
    random_codewords:8,salt_elements:16,field_cardinality_floor_bits:247,
    ideal_sha512_collision_bits_assumed:170,max_opening_points_budget:8
  };
  for(const [key,expected] of Object.entries(fields))
    if(report[key]!==expected)throw new TypeError('unrecognized native profile '+key);
  for(const key of ['rbr_unique_decoding_bits','rbr_list_decoding_bits','rbr_best_bits',
    'air_constraints_derived','air_constraint_degree_derived',
    'batch_openings_derived','quotient_chunks_derived'])
    integer(report[key],key,0,1_000_000);
  if(report.rbr_best_bits!==Math.max(report.rbr_unique_decoding_bits,report.rbr_list_decoding_bits)||
    report.financial_air_complete!==false||report.aegis_target_met!==false||
    report.production_ready!==false||report.quantum_fiat_shamir_qrom_proved!==false)
    throw new TypeError('native RBR claim cannot authorize PQ128');
  const sufficientPerSegmentBits=residualBits+
    logCeil(4n*receipts*BigInt(maxSegments));
  const perInstance=report.rbr_best_bits;
  return Object.freeze({
    schema:'AEGIS_V4_RBR_RESEARCH_SCREEN_V1',
    security_game:'strict-residual-error-per-event-in-a-hypothetical-uniform-adaptive-first-bad-event-reduction',
    receipts_hypothetical:receipts.toString(),
    receipt_segments:maxSegments,
    residual_bits:residualBits,
    required_uniform_adaptive_segment_bits:sufficientPerSegmentBits,
    observed_p3_classical_rbr_bits:perInstance,
    // Even a positive difference is not an applicability finding.
    classically_sized_rbr_term:perInstance>=sufficientPerSegmentBits,
    assumptions_not_discharged:[
      'Source-and-binary authentication of p3-security 0.8.0 result',
      'p3-security hash collision resistance is an unproved ideal SHA-512 input',
      'Uniform adaptive extension of RBR to an actual prover in the quantum oracle model',
      'Fiat-Shamir/QROM compiler theorem for the instantiated transcript',
      'Composed journal, state, segment and program binding',
      'Financial note ownership, values, Merkle membership, nullifiers, fee in a common witness',
      'Full-protocol knowledge extraction and witness privacy',
    ],
    pq128_demonstrated:false,production_ready:false,consensus_activation:false,
    decision:'HOLD_M1_QUANTUM_SOUNDNESS_UNPROVED',
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==3)throw new Error('pass exactly one native JSON report');
  const parsed=JSON.parse(readFileSync(process.argv[2],'utf8'));
  process.stdout.write(JSON.stringify(assessV4Rbr(parsed),null,2)+'\n');
}
