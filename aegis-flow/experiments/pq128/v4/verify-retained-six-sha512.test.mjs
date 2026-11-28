import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyRetainedSixSha512} from './verify-retained-six-sha512.mjs';

const goodHex='a'.repeat(128),differentHex='b'.repeat(128);
test('retained verifier rejects missing paths, unpinned executables and absent evidence',()=>{
  const failure=verifyRetainedSixSha512({
    retainedDir:'relative',binaryPath:'/bin/false',
    expectedStatementDigest512:goodHex,expectedBinarySha512:goodHex});
  assert.equal(failure.valid,false);
  assert.equal(failure.financial_relation_proved,false);
  assert.equal(failure.pq128_demonstrated,false);
  assert.equal(failure.production_ready,false);
  const missing=verifyRetainedSixSha512({
    retainedDir:'/tmp/should-not-exist-aegis-pq128-v4-receipt',
    binaryPath:'/bin/false',
    expectedStatementDigest512:goodHex,expectedBinarySha512:differentHex,
  });
  assert.equal(missing.valid,false);
});

test('tampered retained profile cannot authorize financial receipt or production',()=>{
  const dir=mkdtempSync(join(tmpdir(),'aegis-financial-verifier-negative-'));
  try{
    writeFileSync(join(dir,'public-statement.json'),'{}');
    writeFileSync(join(dir,'financial-proof-profile.json'),JSON.stringify({
      schema:'AEGIS_SIX_SHA512_FINANCIAL_PROVER_RESOURCE_V1',
      hash_calls:6,native_exit_code:0,native_proof_generated:true,
      independent_financial_verification:true,
      statement_rebinding_rejected:true,
      statement_digest512:goodHex,prover_binary_sha512:goodHex,
      pq128_demonstrated:false,
    }));
    const verdict=verifyRetainedSixSha512({
      retainedDir:dir,binaryPath:'/bin/false',
      expectedStatementDigest512:goodHex,expectedBinarySha512:goodHex,
    });
    assert.equal(verdict.valid,false);
    assert.equal(verdict.production_ready,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
