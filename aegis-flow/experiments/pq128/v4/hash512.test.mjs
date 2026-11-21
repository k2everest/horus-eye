import test from 'node:test';
import assert from 'node:assert/strict';
import {ascii,bytes512,frameV4,digestV4,segmentClaimDigestV4} from './hash512.mjs';
const H='ab'.repeat(64);
test('512-bit framed SHA-512 rejects concatenation ambiguity and domain confusion',()=>{
  const a=digestV4('AEGIS_V4_TEST',[Buffer.from('ab'),Buffer.from('c')]);
  const b=digestV4('AEGIS_V4_TEST',[Buffer.from('a'),Buffer.from('bc')]);
  const c=digestV4('AEGIS_V4_OTHER',[Buffer.from('ab'),Buffer.from('c')]);
  assert.match(a,/^[0-9a-f]{128}$/);assert.notEqual(a,b);assert.notEqual(a,c);
  assert.notEqual(frameV4('AEGIS_V4_TEST',[]).toString('hex'),frameV4('AEGIS_V4_TEST',[Buffer.alloc(0)]).toString('hex'));
});
test('candidate segment claim commits index, program, states and proof digest',()=>{
  const input={network_id:'aegis-v4-lab',program_id:H,index:0,segment_count:2,
    pre_state:'01'.repeat(64),post_state:'02'.repeat(64),proof_commitment:'03'.repeat(64)};
  const original=segmentClaimDigestV4(input);
  for(const alteration of [{index:1},{program_id:'04'.repeat(64)},{post_state:'05'.repeat(64)},
    {proof_commitment:'06'.repeat(64)},{network_id:'another'}])
    assert.notEqual(original,segmentClaimDigestV4({...input,...alteration}));
  assert.throws(()=>segmentClaimDigestV4({...input,index:2}));
  assert.throws(()=>segmentClaimDigestV4({...input,program_id:'cd'.repeat(32)}));
});
test('canonical digest and identifiers reject truncation, case and binary garbage',()=>{
  for(const v of [H.toUpperCase(),'aa'.repeat(32),'ff'.repeat(65),'gg'.repeat(64),''])assert.throws(()=>bytes512(v));
  for(const v of ['','á', 'a\\0b','a/b','x'.repeat(65)])assert.throws(()=>ascii(v));
  assert.throws(()=>digestV4('SHA256',[Buffer.alloc(0)]));
  assert.throws(()=>digestV4('AEGIS_V4_TEST',[Buffer.alloc(1024*1024+1)]));
});
