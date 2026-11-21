import test from 'node:test';
import assert from 'node:assert/strict';
import {NativePlonky3V4Verifier} from './plonky3-backend.mjs';

test('no native verifier, no acceptance: malformed and missing binaries always fail closed',async()=>{
  const ID='ab'.repeat(64),digest='cd'.repeat(64);
  for(const bad of [{},{binaryPath:'relative',expectedProgramId:ID,expectedBinarySha512:digest},
    {binaryPath:'/not/installed',expectedProgramId:'ab'.repeat(32),expectedBinarySha512:digest},
    {binaryPath:'/not/installed',expectedProgramId:ID,expectedBinarySha512:digest,timeoutMs:0}])
    assert.throws(()=>new NativePlonky3V4Verifier(bad),TypeError);
  const b=new NativePlonky3V4Verifier({binaryPath:'/not/installed/v4-p3-lab',
    expectedProgramId:ID,expectedBinarySha512:digest});
  assert.equal(b.available(),false);
  assert.deepEqual(await b.verifySegment(null),{valid:false});
  assert.deepEqual(await b.verifySegment({proofBytes:Buffer.from('fake'),programId:ID,
    networkId:'test',statementDigest:digest,segmentIndex:0,segmentCount:1}),{valid:false});
});

test('native backend cannot be mistaken for mainnet proof-engine API',()=>{
  const b=new NativePlonky3V4Verifier({binaryPath:'/not/installed',
    expectedProgramId:'ab'.repeat(64),expectedBinarySha512:'cd'.repeat(64)});
  assert.equal(b.kind,'external-verified-512-bit-segment-claims');
  assert.equal('prove' in b,false);
  assert.equal('verify' in b,false);
  assert.equal('applyTransaction' in b,false);
  assert.equal(b.programId,'ab'.repeat(64));
});
