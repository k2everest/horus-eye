import test from 'node:test';
import assert from 'node:assert/strict';
import { merkleRoot, createInclusionProof, verifyInclusionProof } from './merkle-proof.mjs';

const changed = value => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
test('verifies all leaf paths, including odd-width and one-leaf trees', () => {
  for (const count of [1, 2, 3, 5, 8, 17]) {
    const commitments = Array.from({ length: count }, (_, i) => `commitment-${i}`);
    const trustedRoot = merkleRoot(commitments);
    for (let index = 0; index < count; index++) {
      assert.equal(verifyInclusionProof({ proof: createInclusionProof(commitments, index), trustedRoot }), true);
    }
  }
});
test('rejects forged paths, changed leaves, wrong count/index and untrusted roots', () => {
  const commitments = ['one', 'two', 'three'];
  const trustedRoot = merkleRoot(commitments);
  const proof = createInclusionProof(commitments, 2);
  for (const change of [
    { commitment: 'forged' }, { index: -1 }, { index: 3 }, { index: 0 },
    { leaf_count: 4 }, { leaf_count: 0 }, { version: 'old' },
    { siblings: proof.siblings.slice(1) }, { siblings: ['0'.repeat(64), ...proof.siblings.slice(1)] },
    { siblings: [...proof.siblings, '0'.repeat(64)] }, { extra: true },
  ]) assert.equal(verifyInclusionProof({ proof: { ...proof, ...change }, trustedRoot }), false);
  assert.equal(verifyInclusionProof({ proof, trustedRoot: changed(trustedRoot) }), false);
  assert.equal(verifyInclusionProof({ proof }), false);
  assert.equal(verifyInclusionProof({ proof: null, trustedRoot }), false);
  assert.notEqual(merkleRoot(['a', 'b', 'c']), merkleRoot(['a', 'b', 'c', 'c']));
  assert.throws(() => createInclusionProof([], 0));
});
