import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {FIELD_PRIME,FIELD_CARDINALITY,BLOCK_SPACE,ACCEPTANCE_LIMIT,decodeUniformChallenge512} from './challenge-sampling.mjs';
const encode=n=>Buffer.from(n.toString(16).padStart(128,'0'),'hex');
const reconstruct=cs=>cs.reduce((sum,c,i)=>sum+c*FIELD_PRIME**BigInt(i),0n);

test('decoder rejects the biased tail and encodes five uniform coordinates without truncation',()=>{
  assert.equal(ACCEPTANCE_LIMIT%FIELD_CARDINALITY,0n);
  assert.ok(ACCEPTANCE_LIMIT<BLOCK_SPACE);
  assert.deepEqual(decodeUniformChallenge512(encode(0n)),[0n,0n,0n,0n,0n]);
  assert.equal(reconstruct(decodeUniformChallenge512(encode(FIELD_CARDINALITY-1n))),FIELD_CARDINALITY-1n);
  assert.deepEqual(decodeUniformChallenge512(encode(FIELD_CARDINALITY)),[0n,0n,0n,0n,0n]);
  assert.equal(reconstruct(decodeUniformChallenge512(encode(ACCEPTANCE_LIMIT-1n))),FIELD_CARDINALITY-1n);
  assert.equal(decodeUniformChallenge512(encode(ACCEPTANCE_LIMIT)),null);
  assert.equal(decodeUniformChallenge512(encode(BLOCK_SPACE-1n)),null);
  // Every tuple has exactly ACCEPTANCE_LIMIT/FIELD_CARDINALITY preimages.
  for(const n of [0n,1n,FIELD_PRIME,FIELD_CARDINALITY-1n]) {
    assert.equal(reconstruct(decodeUniformChallenge512(encode(n))),n);
    assert.equal(reconstruct(decodeUniformChallenge512(encode(ACCEPTANCE_LIMIT-FIELD_CARDINALITY+n))),n);
  }
  const sample=decodeUniformChallenge512(randomBytes(64));
  if(sample!==null)assert.ok(sample.length===5&&sample.every(c=>c>=0n&&c<FIELD_PRIME));
  for(const n of [0,32,63,65])assert.throws(()=>decodeUniformChallenge512(Buffer.alloc(n)),TypeError);
  assert.throws(()=>decodeUniformChallenge512('00'.repeat(64)),TypeError);
});
