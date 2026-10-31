import test from 'node:test';
import assert from 'node:assert/strict';

import { buildShieldedTx } from './build-shielded-tx.mjs';
import { validateShieldedTxV1 } from './validate-shielded-tx.mjs';

test('US-007: valida tx construída no caminho feliz', () => {
  const built = buildShieldedTx({
    requestId: 'req-v-1',
    senderTag: 'sender-a',
    recipientTag: 'recipient-b',
    amount: 10,
    randomness: 'r-10',
  });

  const tx = {
    tx_id: built.tx_id,
    request_id: built.request_id,
    sender_tag: 'sender-a',
    recipient_tag: 'recipient-b',
    output_commitment: built.output_note.commitment,
    asset_id: built.output_note.asset_id,
    amount: built.output_note.value,
    transcript_hash: built.transcript_hash,
    pq_signature: built.pq_signature,
    signature_algorithm: built.signature_algorithm,
    pq_public_key: 'pub-key-demo',
  };

  const out = validateShieldedTxV1({ tx });
  assert.equal(out.valid, true);
  assert.equal(out.status_code, 'OK');
});

test('US-007: detecta replay por request_id', () => {
  const seen = new Set();
  const tx = {
    tx_id: 'id',
    request_id: 'req-replay-1',
    sender_tag: 's',
    recipient_tag: 'r',
    output_commitment: 'c',
    asset_id: 'AEGIS',
    amount: 1,
    transcript_hash: 'th',
    pq_signature: 'sig',
    signature_algorithm: 'ML-DSA-65',
    pq_public_key: 'pk',
  };

  // primeira deve falhar por hash inconsistente (não replay ainda)
  const first = validateShieldedTxV1({ tx, seenRequestIds: seen });
  assert.equal(first.valid, false);

  // adiciona manualmente e confirma check de replay
  seen.add('req-replay-1');
  const second = validateShieldedTxV1({ tx, seenRequestIds: seen });
  assert.ok(second.failed_checks.some((x) => x.includes('replay')));
});

test('US-007: detecta inconsistência canônica de transcript', () => {
  const built = buildShieldedTx({
    requestId: 'req-v-3',
    senderTag: 'sender-a',
    recipientTag: 'recipient-b',
    amount: 3,
    randomness: 'r-3',
  });

  const tx = {
    tx_id: built.tx_id,
    request_id: built.request_id,
    sender_tag: 'sender-a',
    recipient_tag: 'recipient-b',
    output_commitment: built.output_note.commitment,
    asset_id: built.output_note.asset_id,
    amount: built.output_note.value,
    transcript_hash: 'tampered-hash',
    pq_signature: built.pq_signature,
    signature_algorithm: built.signature_algorithm,
    pq_public_key: 'pub-key-demo',
  };

  const out = validateShieldedTxV1({ tx });
  assert.equal(out.valid, false);
  assert.ok(out.failed_checks.some((x) => x.includes('transcript_hash inválido')));
});
