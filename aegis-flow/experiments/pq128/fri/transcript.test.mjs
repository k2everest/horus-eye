import test from 'node:test';
import assert from 'node:assert/strict';
import {Transcript} from './transcript.mjs';
import {FIELD_PRIME} from '../challenge-sampling.mjs';

const context=Buffer.from('network=lab;field=goldilocks5;degree=16384;domain=65536;queries=720');
const root='01'.repeat(64),otherRoot='02'.repeat(64);
function execute(ctx=context,firstRoot=root,query={size:65536,count:720}) {
  const t=new Transcript({context:ctx});t.commit(firstRoot);const field=t.fieldChallenge();
  t.commit(otherRoot);const indices=t.queryIndices(query);return {t,field,indices};
}

test('fixed framed context and roots derive deterministic field and index challenges',()=>{
  const a=execute(),b=execute();
  assert.deepEqual(a.field,b.field);assert.deepEqual(a.indices,b.indices);
  assert.equal(a.t.stateDigest(),b.t.stateDigest());assert.match(a.t.stateDigest(),/^[0-9a-f]{128}$/);
  assert.equal(a.field.length,5);assert.ok(a.field.every(x=>typeof x==='bigint'&&x>=0n&&x<FIELD_PRIME));
  assert.equal(a.indices.length,720);assert.ok(a.indices.every(x=>Number.isInteger(x)&&x>=0&&x<65536));
  assert.equal(a.t.oracleCalls,28); // init, two commits, field draw+accept, 23 query blocks
  assert.deepEqual(a.t.counters,{oracleCalls:28,commits:2,fieldChallenges:1,queryChallenges:1,rejectedDraws:0});
  const counters=a.t.counters;counters.oracleCalls=0;assert.equal(a.t.oracleCalls,28);
  for(const changed of [execute(Buffer.concat([context,Buffer.from(';different')])),execute(context,otherRoot)]) {
    assert.notDeepEqual(changed.field,a.field);assert.notDeepEqual(changed.indices,a.indices);
    assert.notEqual(changed.t.stateDigest(),a.t.stateDigest());
  }
});

test('query size and count are bound and sampling deliberately retains repeated indices',()=>{
  assert.deepEqual(execute(context,root,{size:1,count:40}).indices,Array(40).fill(0));
  const sample=execute(context,root,{size:2,count:1024}).indices;
  assert.ok(sample.every(i=>i===0||i===1));assert.ok(sample.includes(0)&&sample.includes(1));
  const a=execute(context,root,{size:16,count:50}),b=execute(context,root,{size:16,count:51});
  assert.notDeepEqual(a.indices,b.indices.slice(0,50));assert.notEqual(a.t.stateDigest(),b.t.stateDigest());
});

test('transcript state enforces commitment/challenge order and seals after indices',()=>{
  const t=new Transcript({context});
  assert.throws(()=>t.fieldChallenge(),/ORDER/);assert.throws(()=>t.queryIndices({size:2,count:2}),/ORDER/);
  t.commit(root);assert.throws(()=>t.commit(root),/ORDER/);
  t.fieldChallenge();assert.throws(()=>t.fieldChallenge(),/ORDER/);
  t.commit(otherRoot);t.queryIndices({size:2,count:2});
  assert.throws(()=>t.commit(root),/ORDER/);assert.throws(()=>t.fieldChallenge(),/ORDER/);
  assert.throws(()=>t.queryIndices({size:2,count:2}),/ORDER/);
  const rounds=new Transcript({context});
  for(let i=0;i<32;i++){rounds.commit(root);rounds.fieldChallenge();}
  rounds.commit(root);assert.throws(()=>rounds.fieldChallenge(),/ROUND_LIMIT/);
});

test('strict roots, bounded parameters and a fixed hash suite reject weakening and malformed input',()=>{
  for(const opts of [undefined,{},null,{context:Buffer.alloc(0)},{context:'abc'},
    {context:Buffer.alloc(16385)},{context,maxDraws:0},{context,maxDraws:17},{context,maxDraws:1.5},
    {context,hash:'sha256'},{context,suite:'legacy'}])assert.throws(()=>new Transcript(opts),TypeError);
  const t=new Transcript({context});const original=t.stateDigest();
  for(const bad of ['00'.repeat(32),'AA'.repeat(64),'0'.repeat(127),'zz'.repeat(64),Buffer.alloc(64),null])assert.throws(()=>t.commit(bad),TypeError);
  assert.equal(t.stateDigest(),original);t.commit(root);
  for(const options of [{size:3,count:1},{size:65537,count:1},{size:0,count:1},{size:2,count:0},
    {size:2,count:1025},{size:2,count:1.5},{size:NaN,count:1},{size:2,count:1,hash:'sha256'},null])assert.throws(()=>t.queryIndices(options),TypeError);
  const c=Buffer.from(context),isolated=new Transcript({context:c});c.fill(0);
  assert.equal(isolated.stateDigest(),new Transcript({context}).stateDigest());
  assert.notEqual(new Transcript({context,maxDraws:1}).stateDigest(),new Transcript({context,maxDraws:4}).stateDigest());
});
