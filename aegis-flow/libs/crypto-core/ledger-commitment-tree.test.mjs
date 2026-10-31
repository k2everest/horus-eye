import test from 'node:test';
import assert from 'node:assert/strict';

import { computeCommitmentRoot, LedgerCommitmentTree } from './ledger-commitment-tree.mjs';

test('US-012: computeCommitmentRoot é determinístico', () => {
  const commitments = ['c1', 'c2', 'c3'];
  assert.equal(computeCommitmentRoot(commitments), computeCommitmentRoot(commitments));
});

test('US-012: commitBlock persiste root por altura', () => {
  const tree = new LedgerCommitmentTree();
  const b1 = tree.commitBlock({ height: 1, newCommitments: ['c1', 'c2'] });
  const b2 = tree.commitBlock({ height: 2, newCommitments: ['c3'] });

  assert.equal(tree.getRoot(1), b1.root);
  assert.equal(tree.getRoot(2), b2.root);
  assert.notEqual(b1.root, b2.root);
  assert.equal(b2.commitment_count, 3);
});

test('US-012: getSnapshot retorna commitments imutáveis por altura', () => {
  const tree = new LedgerCommitmentTree();
  tree.commitBlock({ height: 1, newCommitments: ['c1'] });
  tree.commitBlock({ height: 2, newCommitments: ['c2'] });

  const snapshot = tree.getSnapshot(1);
  assert.deepEqual(snapshot.commitments, ['c1']);
  assert.equal(tree.getSnapshot(2).commitments.length, 2);
});

test('US-012: rejeita commit duplicado na mesma altura', () => {
  const tree = new LedgerCommitmentTree();
  tree.commitBlock({ height: 1, newCommitments: ['c1'] });

  assert.throws(() => tree.commitBlock({ height: 1, newCommitments: ['c2'] }), /already committed/);
});
