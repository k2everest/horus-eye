import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSixSha512Capacity} from './financial-capacity-preflight.mjs';

test('six SHA512 public program has reproducible 2-adic trace geometry but NO PQ128 attestation',()=>{
  const result=publicSixSha512Capacity();
  assert.equal(result.sha512_hash_calls,6);
  assert.ok(result.gate_count>1_000_000);
  assert.ok(result.wire_count>1_000_000);
  assert.ok((result.trace_rows & (result.trace_rows-1))===0);
  assert.ok(result.trace_rows>=result.gate_count);
  assert.ok(result.trace_rows>=result.wire_count);
  assert.equal(result.committed_rows,2*result.trace_rows);
  assert.equal(result.lde_rows,8*result.committed_rows);
  assert.equal(result.main_trace_bytes_lower_bound,8*result.trace_rows);
  assert.equal(result.preprocessed_bytes_lower_bound,40*result.trace_rows);
  assert.equal(result.combined_trace_bytes_lower_bound,48*result.trace_rows);
  assert.equal(result.baseline_main_columns,4);
  assert.equal(result.baseline_preprocessed_columns,11);
  assert.equal(result.optimized_main_columns,2);
  assert.equal(result.optimized_preprocessed_columns,10);
  assert.equal(result.baseline_combined_trace_bytes_lower_bound,60*result.trace_rows);
  assert.equal(result.avoided_raw_trace_bytes_lower_bound,12*result.trace_rows);
  assert.equal(result.reduction_in_raw_trace_bytes_percent,20);
  assert.equal(result.prover_peak_ram_reduction_measured,false);
  assert.equal(result.e16_extension_degree,16);
  assert.equal(result.fri_queries,512);
  assert.equal(result.random_hiding_codewords,16);
  for(const name of [
    'peak_memory_measured','full_plonky3_financial_proof_generated',
    'round_by_round_knowledge_soundness_proved','qrom_security_128_bits_proved',
    'pq128_demonstrated','mainnet_financial_activation_allowed',
  ]) assert.equal(result[name],false,name+' must remain fail closed');
});
