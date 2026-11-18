import test from 'node:test';
import assert from 'node:assert/strict';
import {IncrementalMerkleTree, merkleRoot, createInclusionProof, verifyInclusionProof} from './merkle-proof.mjs';

test('incremental roots preserve reference roots and existing inclusion proofs across odd widths and powers of two', () => {
  let tree = new IncrementalMerkleTree();
  const commitments = [];
  assert.equal(tree.root, merkleRoot([]));
  for (let count = 1; count <= 4097; count++) {
    commitments.push(`commitment-${count}`);
    tree.append(commitments.at(-1));
    if (count <= 129 || [255,256,257,511,512,513,1023,1024,1025,2047,2048,2049,4095,4096,4097].includes(count)) {
      assert.equal(tree.root, merkleRoot(commitments), `count ${count}`);
      for (const index of new Set([0,Math.floor(count/2),count-1])) {
        assert.equal(verifyInclusionProof({proof:createInclusionProof(commitments,index),trustedRoot:tree.root}),true);
      }
      tree = new IncrementalMerkleTree(tree.snapshot());
    }
  }
});
test('frontiers fork independently and do not expose mutable internal state', () => {
  const tree = new IncrementalMerkleTree(); for (const leaf of ['a','b','c']) tree.append(leaf);
  const saved = tree.snapshot(), fork = new IncrementalMerkleTree(saved);
  saved.frontier.fill('0'.repeat(64)); saved.count = 1;
  tree.append('d'); fork.append('e'); fork.append('f');
  assert.equal(tree.root,merkleRoot(['a','b','c','d']));
  assert.equal(fork.root,merkleRoot(['a','b','c','e','f']));
  assert.notEqual(merkleRoot(['a','b','c']),merkleRoot(['a','b','c','c']));
});
test('invalid frontiers and inputs fail before changing state; the circuit capacity stays enforced', () => {
  for (const value of [null,{}, {count:-1,frontier:[]}, {count:1_000_001,frontier:[]},
    {count:1,frontier:[null]}, {count:2,frontier:['0'.repeat(64),'0'.repeat(64)]},
    {count:1,frontier:['x']}, {count:0,frontier:[],extra:true}]) assert.throws(() => new IncrementalMerkleTree(value));
  const tree = new IncrementalMerkleTree();
  for (const value of ['',null,'x'.repeat(129)]) assert.throws(() => tree.append(value));
  assert.equal(tree.count,0); assert.equal(tree.root,merkleRoot([]));
  const count = 999999, frontier = Array.from({length:20},(_,i) => count & (1<<i) ? '12'.repeat(32) : null);
  const full = new IncrementalMerkleTree({count,frontier}); full.append('last');
  const before = full.snapshot(), root = full.root;
  assert.throws(() => full.append('overflow'),/capacity/);
  assert.deepEqual(full.snapshot(),before); assert.equal(full.root,root);
});
