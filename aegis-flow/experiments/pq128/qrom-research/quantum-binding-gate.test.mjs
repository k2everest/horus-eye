import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPinnedQuantumBinding} from './quantum-binding-gate.mjs';

test('actual BabyBear^8 cannot satisfy Q2=2^128 loss under 2^64 queries',()=>{
 const x=assessPinnedQuantumBinding();
 assert.equal(x.native_digest_bits,512);
 assert.equal(x.native_merkle_cap_height,3);
 assert.equal(x.actual_native_extension_degree,8);
 assert.equal(x.required_interactive_bits_for_q2_term,256);
 assert.ok(x.actual_extension_field_bits>247&&x.actual_extension_field_bits<248);
 assert.equal(x.actual_field_meets_minimum_q2_screen,false);
 assert.equal(x.ideal_sha512_quantum_collision_term_bits,320);
 assert.equal(x.quantum_collapse_binding_proved,false);
 assert.equal(x.quantum_128_bits_certified,false);
 assert.equal(x.production_ready,false);
});
test('a hypothetical degree 16 clears only finite-field capacity, not knowledge or PQ128',()=>{
 const x=assessPinnedQuantumBinding({candidateExtensionDegree:16,reserveBits:32});
 assert.equal(x.required_interactive_bits_for_q2_term,288);
 assert.equal(x.actual_field_meets_minimum_q2_screen,false);
 assert.equal(x.candidate_field_meets_minimum_q2_screen,true);
 assert.equal(x.actual_native_extension_degree,8);
 assert.equal(x.sha512_collapsing_in_qrom_proved,false);
 assert.equal(x.quantum_full_oracle_extraction_proved,false);
 assert.equal(x.release_gate,'HOLD_NO_GO');
});
test('relying on ideal SHA512 collision strength never elevates actual proof to PQ128',()=>{
 for(const qb of [0,32,64,128]){
  const x=assessPinnedQuantumBinding({quantumOracleQueryBits:qb});
  assert.equal(x.position_binding_reduction_conditional_on_sha512_collision_resistance,true);
  assert.equal(x.cms_qrom_reduction_instantiated,false);
  assert.equal(x.quantum_128_bits_certified,false);
 }
});
test('reject malformed security budgets rather than silently reporting zero loss',()=>{
 for(const options of [{targetBits:0},{quantumOracleQueryBits:-1},
   {reserveBits:-1},{candidateExtensionDegree:NaN},
   {targetBits:Infinity},{quantumOracleQueryBits:257}]){
  assert.throws(()=>assessPinnedQuantumBinding(options),/INVALID_QUANTUM_BINDING_BUDGET/);
 }
});
