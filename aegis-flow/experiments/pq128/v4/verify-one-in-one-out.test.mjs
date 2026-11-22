import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyOneInOneOutNative512} from './verify-one-in-one-out.mjs';

test('full-financial verifier fails closed unless binary, program and independently pinned statement are available',()=>{
  for(const options of [
    {},
    {statement:{},expectedStatementDigest:'11'.repeat(64)},
    {statement:{},binaryPath:'/tmp/nonexistent',proofPath:'/tmp/none',
      expectedStatementDigest:'11'.repeat(64),expectedBinarySha512:'22'.repeat(64)},
    {statement:{},binaryPath:'./untrusted',proofPath:'./proof',
      expectedStatementDigest:'11'.repeat(64),expectedBinarySha512:'22'.repeat(64)},
    {statement:{},binaryPath:'/tmp/nonexistent',proofPath:'/tmp/none',
      expectedStatementDigest:'ABC',expectedBinarySha512:'22'.repeat(64)},
  ]){
    const result=verifyOneInOneOutNative512(options);
    assert.equal(result.valid,false);
    assert.equal(result.financial_relation_proved,false);
    assert.equal(result.aegis_target_met,false);
    assert.equal(result.production_ready,false);
  }
});
