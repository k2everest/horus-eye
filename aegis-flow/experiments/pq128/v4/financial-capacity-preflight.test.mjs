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
  assert.equal(result.main_trace_bytes_lower_bound,12*result.trace_rows);
  assert.equal(result.preprocessed_bytes_lower_bound,44*result.trace_rows);
  assert.equal(result.combined_trace_bytes_lower_bound,56*result.trace_rows);
  assert.equal(result.e16_extension_degree,16);
  assert.equal(result.fri_queries,512);
  assert.equal(result.random_hiding_codewords,16);
  for(const name of [
    'peak_memory_measured','full_plonky3_financial_proof_generated',
    'round_by_round_knowledge_soundness_proved','qrom_security_128_bits_proved',
    'pq128_demonstrated','mainnet_financial_activation_allowed',
  ]) assert.equal(result[name],false,name+' must remain fail closed');
});
