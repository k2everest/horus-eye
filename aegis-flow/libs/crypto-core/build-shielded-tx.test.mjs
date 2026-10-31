import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShieldedTx } from './build-shielded-tx.mjs';

test('buildShieldedTx deve montar tx blindada mínima com assinatura', () => {
  const tx = buildShieldedTx({
    requestId: 'req-1',
    senderTag: 'sender-a',
    recipientTag: 'recipient-b',
    amount: 7,
    randomness: 'r-1',
  });

  assert.equal(typeof tx.tx_id, 'string');
  assert.equal(tx.tx_id.length, 64);
  assert.equal(typeof tx.output_note.commitment, 'string');
  assert.equal(tx.output_note.commitment.length, 64);
  assert.equal(typeof tx.pq_signature, 'string');
  assert.equal(tx.signature_algorithm, 'ML-DSA-65');
});

test('buildShieldedTx deve falhar para amount inválido', () => {
  assert.throws(
    () =>
      buildShieldedTx({
        requestId: 'req-2',
        senderTag: 'sender-a',
        recipientTag: 'recipient-b',
        amount: 0,
        randomness: 'r-1',
      }),
    /amount must be positive/,
  );
});
