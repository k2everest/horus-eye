import test from 'node:test';
import assert from 'node:assert/strict';
import {conditionalQromSecurityScreen} from './qrom-explicit-two-term-budget.mjs';

test('E8 analytic terms cannot pass the numeric quantum screen even as a hypothesis',()=>{
  const x=conditionalQromSecurityScreen({rbrKnowledgeBits:226.75207248655641});
  assert.ok(x.final_rbr_term_bits<19);
  assert.equal(x.conditional_numeric_screen_clears_target,false);
  assert.equal(x.pq128_demonstrated,false);
});
test('E16+512 *hypothetical* RBR 424.978 bits clears separate Q2/Q3 numerical screen',()=>{
  const x=conditionalQromSecurityScreen({rbrKnowledgeBits:424.97836210218276});
  assert.ok(x.final_rbr_term_bits>216&&x.final_rbr_term_bits<218);
  assert.equal(x.final_hash_collision_term_bits,240);
  assert.ok(x.conditional_union_security_bits>216);
  assert.equal(x.conditional_numeric_screen_clears_target,true);
  // The physical protocol has not established rbr KNOWLEDGE,
  // QROM constants, a collapsing commitment, or E16 field compatibility.
  assert.equal(x.actual_native_rbr_knowledge_bit_lower_bound_proved,false);
  assert.equal(x.actual_merkle_online_quantum_extraction_proved,false);
  assert.equal(x.actual_qrom_compiler_constants_bounded,false);
  assert.equal(x.pq128_demonstrated,false);
});
test('the two QROM error terms have genuinely different quantum query exponents',()=>{
  const q0=conditionalQromSecurityScreen({rbrKnowledgeBits:425,
    quantumOracleQueryBits:30,proofOverheadBits:0});
  const q1=conditionalQromSecurityScreen({rbrKnowledgeBits:425,
    quantumOracleQueryBits:31,proofOverheadBits:0});
  assert.equal(q0.final_rbr_term_bits-q1.final_rbr_term_bits,2);
  assert.equal(q0.final_hash_collision_term_bits-
    q1.final_hash_collision_term_bits,3);
});
test('union correction never exceeds the better individually limiting error',()=>{
  for(const bits of [64,128,256,336,425,512]){
    const x=conditionalQromSecurityScreen({rbrKnowledgeBits:bits});
    assert.ok(x.conditional_union_security_bits<=
      Math.min(x.final_rbr_term_bits,x.final_hash_collision_term_bits));
  }
});
test('malformed or adversarial inputs fail closed',()=>{
  for(const options of [{rbrKnowledgeBits:-1},{rbrKnowledgeBits:Infinity},
    {rbrKnowledgeBits:NaN},{rbrKnowledgeBits:10000},
    {rbrKnowledgeBits:425,hashDigestBits:0},
    {rbrKnowledgeBits:425,quantumOracleQueryBits:257},
    {rbrKnowledgeBits:425,proofOverheadBits:-1}]){
    assert.throws(()=>conditionalQromSecurityScreen(options),/UNSUPPORTED_QROM/);
  }
});
