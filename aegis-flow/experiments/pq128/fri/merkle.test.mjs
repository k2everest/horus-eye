import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMerkle, verifyOpening, verifyMany } from './merkle.mjs';

const values = size => Array.from({length:size},(_,index) => Buffer.alloc(40,index+1));
const mutate = hex => (hex[0] === '0' ? '1' : '0') + hex.slice(1);

test('all leaves verify; index, size and tree structure bind otherwise identical values', () => {
  for (const size of [2,4,8,16,32]) {
    const tree = buildMerkle(values(size));
    assert.match(tree.root,/^[0-9a-f]{128}$/);
    for (let index = 0; index < size; index++) {
      const opening = tree.open(index);
      assert.deepEqual(opening,{index,value:values(size)[index].toString('hex'),path:opening.path});
      assert.equal(opening.path.length,Math.log2(size));
      assert.equal(verifyOpening({root:tree.root,size,index,opening}),true);
    }
  }
  // Repeated field values are legitimate (for example a constant polynomial).
  const repeated = buildMerkle(Array.from({length:8},() => Buffer.alloc(40,7)));
  const opening = repeated.open(0);
  assert.equal(verifyOpening({root:repeated.root,size:8,index:0,opening}),true);
  assert.equal(verifyOpening({root:repeated.root,size:8,index:1,opening:{...opening,index:1}}),false);
  const small = buildMerkle(Array.from({length:4},() => Buffer.alloc(40,7)));
  assert.notEqual(small.root,repeated.root);
  assert.equal(verifyOpening({root:repeated.root,size:4,index:0,opening:small.open(0)}),false);
});

test('altered roots, leaves, paths, positions, depths, noncanonical encodings and extra fields are rejected', () => {
  const tree = buildMerkle(values(8)), opening = tree.open(3);
  const input = {root:tree.root,size:8,index:3,opening};
  assert.equal(verifyOpening(input),true);
  for (const patch of [
    {index:2},{value:mutate(opening.value)},{value:opening.value.slice(2)},
    {value:'AB'.repeat(40)},{extra:1},
    {path:[...opening.path,opening.path[0]]},{path:opening.path.slice(1)},
    {path:opening.path.map((value,index) => index===0?mutate(value):value)},
    {path:[...opening.path].reverse()},
    {path:opening.path.map(() => opening.path[0])},
    {path:opening.path.map((value,index) => index===0?value.toUpperCase():value)},
    {path:opening.path.map((value,index) => index===0?value.slice(2):value)},
    {path:null},{path:{length:3}},{index:'3'},
  ]) assert.equal(verifyOpening({...input,opening:{...opening,...patch}}),false);
  for (const patch of [
    {root:mutate(tree.root)},{root:tree.root.toUpperCase()},{root:tree.root.slice(2)},
    {size:4},{size:16},{index:2},{index:'3'},{opening:null},{opening:[]},
  ]) assert.equal(verifyOpening({...input,...patch}),false);
});

test('bounds fail closed and caller mutations cannot alter the committed tree or future openings', () => {
  for (const size of [0,1,3,65537,-1,NaN,Infinity,2.5]) {
    assert.equal(verifyOpening({root:'00'.repeat(64),size,index:0,opening:{index:0,value:'00'.repeat(40),path:[]}}),false);
  }
  for (const size of [0,1,3,65537]) assert.throws(() => buildMerkle(Array(size).fill(Buffer.alloc(40))));
  assert.throws(() => buildMerkle([Buffer.alloc(39),Buffer.alloc(40)]));
  assert.throws(() => buildMerkle([new Uint8Array(40),Buffer.alloc(40)]));
  assert.throws(() => buildMerkle(null));
  const source = values(8), tree = buildMerkle(source), original = tree.open(2);
  const root = tree.root;
  source[2].fill(0); source[0] = Buffer.alloc(40); source.length = 0;
  const changed = tree.open(2); changed.value = '00'.repeat(40); changed.path.fill('00'.repeat(64)); changed.index = 1;
  assert.deepEqual(tree.open(2),original);
  assert.equal(tree.root,root);
  assert.equal(verifyOpening({root,size:8,index:2,opening:tree.open(2)}),true);
  for (const index of [-1,8,NaN,Infinity,1.5,'2']) {
    assert.throws(() => tree.open(index));
    assert.equal(verifyOpening({root,size:8,index,opening:original}),false);
  }
  assert.equal(verifyOpening(),false);
  assert.equal(verifyOpening(null),false);
});

test('the maximum supported tree size accepts openings at both index boundaries', () => {
  const size = 65536, tree = buildMerkle(Array.from({length:size},() => Buffer.alloc(40)));
  for (const index of [0,size-1]) assert.equal(verifyOpening({root:tree.root,size,index,opening:tree.open(index)}),true);
  assert.throws(() => tree.open(size));
});

test('canonical minimal multiproofs agree with individual paths and normalize duplicate query indices', () => {
  const size = 16, tree = buildMerkle(values(size)), indices = [13,1,3,1,0,8,9];
  const proof = tree.openMany(indices), expected = [...new Set(indices)].sort((a,b)=>a-b);
  assert.deepEqual(proof.leaves.map(entry=>entry.index),expected);
  assert.equal(verifyMany({root:tree.root,size,indices,proof}),true);
  for (const index of expected) {
    const single = tree.open(index);
    assert.equal(verifyOpening({root:tree.root,size,index,opening:single}),true);
    assert.equal(proof.leaves.find(entry=>entry.index===index).value,single.value);
  }
  for (let i = 1; i < proof.nodes.length; i++) {
    const left = proof.nodes[i-1], right = proof.nodes[i];
    assert.ok(left.level < right.level || left.level===right.level && left.index<right.index);
  }
  const all = Array.from({length:size},(_,i)=>i), complete = tree.openMany(all);
  assert.deepEqual(complete.nodes,[]);
  assert.equal(verifyMany({root:tree.root,size,indices:all,proof:complete}),true);
  const original = tree.openMany(indices);
  proof.leaves[0].value = '00'.repeat(40); proof.nodes[0].hash = '00'.repeat(64); proof.nodes.length = 0;
  assert.deepEqual(tree.openMany(indices),original);
});

test('multiproofs reject extra/missing/duplicate siblings, reordered leaves/nodes and substituted query sets', () => {
  const size = 16, tree = buildMerkle(values(size)), indices = [1,3,4], proof = tree.openMany(indices);
  const input = {root:tree.root,size,indices,proof};
  const sorted = nodes => [...nodes].sort((a,b)=>a.level-b.level||a.index-b.index);
  assert.equal(verifyMany(input),true);
  for (const changed of [
    {...proof,extra:1}, {...proof,leaves:[...proof.leaves].reverse()},
    {...proof,leaves:[...proof.leaves,proof.leaves[0]]},
    {...proof,leaves:proof.leaves.map((entry,i)=>i===0?{...entry,value:mutate(entry.value)}:entry)},
    {...proof,leaves:proof.leaves.map((entry,i)=>i===0?{...entry,extra:1}:entry)},
    {...proof,nodes:proof.nodes.slice(1)}, {...proof,nodes:[...proof.nodes].reverse()},
    {...proof,nodes:sorted([...proof.nodes,proof.nodes[0]])},
    {...proof,nodes:sorted([...proof.nodes,{level:0,index:1,hash:'00'.repeat(64)}])},
    {...proof,nodes:proof.nodes.map((entry,i)=>i===0?{...entry,hash:mutate(entry.hash)}:entry)},
    {...proof,nodes:proof.nodes.map((entry,i)=>i===0?{...entry,hash:entry.hash.toUpperCase()}:entry)},
    {...proof,nodes:proof.nodes.map((entry,i)=>i===0?{...entry,level:100}:entry)},
    {...proof,nodes:proof.nodes.map((entry,i)=>i===0?{...entry,index:size}:entry)},
    {...proof,nodes:proof.nodes.map((entry,i)=>i===0?{...entry,extra:1}:entry)},
  ]) assert.equal(verifyMany({...input,proof:changed}),false);
  for (const patch of [{indices:[]},{indices:[1,2,4]},{indices:[-1]},{indices:[size]},
    {indices:['1']},{indices:null},{size:3},{root:mutate(tree.root)},{proof:null}]) assert.equal(verifyMany({...input,...patch}),false);
  for (const indices of [[],[-1],[size],['1'],null]) assert.throws(()=>tree.openMany(indices));
  assert.equal(verifyMany(),false); assert.equal(verifyMany(null),false);
});

test('a 1000-query multiproof on 65536 leaves is smaller than independent paths and verifies at the maximum size', () => {
  const size = 65536, tree = buildMerkle(Array.from({length:size},()=>Buffer.alloc(40)));
  const indices = Array.from({length:1000},(_,i)=>i*61), proof = tree.openMany(indices);
  assert.equal(verifyMany({root:tree.root,size,indices,proof}),true);
  const paths = indices.map(index=>tree.open(index));
  assert.ok(Buffer.byteLength(JSON.stringify(proof)) < Buffer.byteLength(JSON.stringify(paths)));
  assert.ok(proof.nodes.length < indices.length * Math.log2(size));
  assert.ok(proof.leaves.length+proof.nodes.length <= 2*size);
});
