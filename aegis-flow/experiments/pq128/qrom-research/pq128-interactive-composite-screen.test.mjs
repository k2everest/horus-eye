import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateWiredInteractiveUDR} from './pq128-interactive-composite-screen.mjs';

const shape={numConstraints:100,maxConstraintDegree:3,
  quotientChunks:8,numBatchedFunctions:20};

test('source-equivalent UDR composite reproduces the 170-bit existing assumed collision cap',()=>{
  const x=estimateWiredInteractiveUDR({...shape,extensionDegree:8,queries:320});
  assert.equal(x.modulus_bits_floor,247);
  assert.equal(x.entire_screen_min_term.label,
    'hash-collision-external-assumption');
  assert.equal(x.entire_screen_min_term.bits,170);
  assert.ok(Math.abs(x.algebraic_min_term.bits-226.75207248655641)<1e-7);
  assert.equal(x.all_terms_screen_clears_target,false);
  assert.equal(x.pq128_demonstrated,false);
});
test('BabyBear16/512 FRI changes the algebraic bottleneck to query term; no quantum certificate',()=>{
  const x=estimateWiredInteractiveUDR({...shape,extensionDegree:16,queries:512,
    nativeVerifierReportAttested:true});
  assert.equal(x.modulus_bits_floor,494);
  assert.equal(x.algebraic_min_term.label,'fri-query');
  assert.ok(x.algebraic_min_term.bits>424&&x.algebraic_min_term.bits<426);
  assert.equal(x.research_interactive_target_bits,336);
  assert.equal(x.algebraic_screen_clears_target,true);
  assert.equal(x.all_terms_screen_clears_target,false);
  assert.equal(x.native_report_attestation_claim,true);
  assert.equal(x.source_binary_attestation_proved,false);
  assert.equal(x.cms_qrom_constants_instantiated,false);
  assert.equal(x.pq128_demonstrated,false);
});
test('changing assumed hash collision bits cannot turn a screen into PQ128 certification',()=>{
  const x=estimateWiredInteractiveUDR({...shape,extensionDegree:16,queries:512,
    hashCollisionAssumptionBits:512});
  assert.equal(x.entire_screen_min_term.label,'fri-query');
  assert.equal(x.all_terms_screen_clears_target,true);
  assert.equal(x.quantum_adversarial_merkle_extractor_proved,false);
  assert.equal(x.fri_round_by_round_knowledge_proved,false);
  assert.equal(x.full_financial_witness_extractor_proved,false);
  assert.equal(x.pq128_demonstrated,false);
  assert.equal(x.release_gate,'HOLD_NO_GO');
});
test('source UDR batch term is absent for one function and strictly worsens with more',()=>{
  const small=estimateWiredInteractiveUDR({...shape,extensionDegree:16,
    queries:512,numBatchedFunctions:1});
  assert.equal(small.conditional_term_bits.some(x=>x.label==='pcs-batching-udr'),false);
  const medium=estimateWiredInteractiveUDR({...shape,extensionDegree:16,
    queries:512,numBatchedFunctions:20});
  const wide=estimateWiredInteractiveUDR({...shape,extensionDegree:16,
    queries:512,numBatchedFunctions:200});
  const value=x=>x.conditional_term_bits.find(y=>y.label==='pcs-batching-udr').bits;
  assert.ok(value(wide)<value(medium));
});
test('actual trace shape cannot be promoted by invented non-power-two quotient chunk count',()=>{
  for(const params of [
    {quotientChunks:3},{numConstraints:0},{maxConstraintDegree:0},
    {extensionDegree:0},{queries:0},{numBatchedFunctions:0},
    {hashCollisionAssumptionBits:-1},{nativeVerifierReportAttested:'true'},
  ]){
    assert.throws(()=>estimateWiredInteractiveUDR({
      ...shape,extensionDegree:16,queries:512,...params
    }),/UNSUPPORTED_WIRED_RBR_SHAPE/);
  }
});
