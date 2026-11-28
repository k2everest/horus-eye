// Reproducible PUBLIC six-SHA512 circuit sizing only. No private witness,
// proving key, FRI query transcript, or security certificate is generated.
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {compileOneInOneOut512} from './single-transfer-circuit.mjs';

// Gate output z and wire table bits are derived/reindexed; only a,b are committed.
const TRACE_COLUMNS = 2;
// The public active flag is derived from four immutable op flags in Rust.
const PREPROCESSED_COLUMNS = 10;
const BASE_ELEMENT_BYTES = 4;
const MIN_ROWS = 4096;
const HIDING_TRACE_MULTIPLIER = 2;
const FRI_BLOWUP = 8;
const BABYBEAR_BASE_MAX_LDE = 1n << 27n;
const E16_QUERIES = 512;
const E16_RANDOM_CODEWORDS = 16;

export function publicSixSha512Capacity() {
  const fixture=native512Fixture({
    leafCount:1,value:'100',outputValue:'99',fee:'1',
  });
  const digest=financialStatementDigest512(fixture.statement);
  const manifest=compileOneInOneOut512({
    statement:fixture.statement,expectedStatementDigest:digest,
  });
  if (manifest.hash_calls!==6 || manifest.gate_count<=1_000_000)
    throw new Error('FINANCIAL_CIRCUIT_NOT_COMPLETE');
  const num=BigInt(Math.max(manifest.gate_count,manifest.wire_count,MIN_ROWS));
  const rows=1n << BigInt((num-1n).toString(2).length);
  const committedRows=rows*BigInt(HIDING_TRACE_MULTIPLIER);
  const ldeRows=committedRows*BigInt(FRI_BLOWUP);
  if(ldeRows>BABYBEAR_BASE_MAX_LDE)
    throw new Error('PUBLIC_CIRCUIT_EXCEEDS_BABYBEAR_DFT_DOMAIN');
  const baseTraceBytes=rows*BigInt(TRACE_COLUMNS*BASE_ELEMENT_BYTES);
  const publicPreprocessedBytes=rows*BigInt(PREPROCESSED_COLUMNS*BASE_ELEMENT_BYTES);
  // The independently measured 2026-11-28 one-SHA512 experiment ran with
  // four main and eleven preprocessed columns. New AIR still needs a
  // finished proving benchmark: raw trace bytes are NOT total prover RSS.
  const oldTraceBytes=rows*BigInt((4+11)*BASE_ELEMENT_BYTES);
  const savedTraceBytes=oldTraceBytes-baseTraceBytes-publicPreprocessedBytes;
  // These are allocation LOWER BOUNDS, not estimates of peak prover RSS:
  // omits duplicated committed traces, LDEs, FRI, LogUp and Merkle trees.
  const output={
    schema:'AEGIS_E16_SIX_SHA512_PUBLIC_CAPACITY_V1',
    public_circuit_sha512:manifest.boolean_circuit_sha512,
    financial_statement_digest512:digest,
    sha512_hash_calls:manifest.hash_calls,
    gate_count:manifest.gate_count,
    wire_count:manifest.wire_count,
    trace_rows:Number(rows),
    committed_rows:Number(committedRows),
    lde_rows:Number(ldeRows),
    main_trace_bytes_lower_bound:Number(baseTraceBytes),
    preprocessed_bytes_lower_bound:Number(publicPreprocessedBytes),
    combined_trace_bytes_lower_bound:Number(baseTraceBytes+publicPreprocessedBytes),
    baseline_main_columns:4,
    baseline_preprocessed_columns:11,
    optimized_main_columns:TRACE_COLUMNS,
    optimized_preprocessed_columns:PREPROCESSED_COLUMNS,
    baseline_combined_trace_bytes_lower_bound:Number(oldTraceBytes),
    avoided_raw_trace_bytes_lower_bound:Number(savedTraceBytes),
    reduction_in_raw_trace_bytes_percent:Number((100*Number(savedTraceBytes)/Number(oldTraceBytes)).toFixed(2)),
    prover_peak_ram_reduction_measured:false,
    e16_extension_degree:16,
    fri_queries:E16_QUERIES,
    random_hiding_codewords:E16_RANDOM_CODEWORDS,
    peak_memory_measured:false,
    full_plonky3_financial_proof_generated:false,
    round_by_round_knowledge_soundness_proved:false,
    qrom_security_128_bits_proved:false,
    pq128_demonstrated:false,
    mainnet_financial_activation_allowed:false,
  };
  return Object.freeze(output);
}
if(process.argv[1]?.endsWith('/financial-capacity-preflight.mjs'))
  process.stdout.write(JSON.stringify(publicSixSha512Capacity(),null,2)+'\n');
