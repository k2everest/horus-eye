import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShieldedTx } from './build-shielded-tx.mjs';
import { generateSigningKeyPair, generateKemKeyPair } from './pqc-wrapper.mjs';
import { openEnvelope } from './sealed-envelope.mjs';
import { validateShieldedTxV1 } from './validate-shielded-tx.mjs';

const signer = generateSigningKeyPair();
const recipient = generateKemKeyPair();
const input = { requestId: 'req-1', amount: 7, privateKey: signer.privateKey, recipientPublicKey: recipient.publicKey };

test('builder returns signed public transaction and recipient-encrypted note without secrets', () => {
  const tx = buildShieldedTx(input);
  assert.equal(validateShieldedTxV1({ tx }).valid, true);
  const plaintext = openEnvelope({ envelope: tx.encrypted_output, recipientPrivateKey: recipient.privateKey, expectedContext: 'NOTE_OUTPUT_V1:req-1' });
  const note = JSON.parse(plaintext.toString());
  plaintext.fill(0);
  assert.equal(note.value, 7);
  assert.equal(note.commitment, tx.output_commitment);
  assert.equal(note.owner_tag, tx.recipient_tag);
  assert.equal(tx.output_note, undefined);
  assert.equal(tx.opening, undefined);
  assert.equal(tx.privateKey, undefined);
  assert.ok(!JSON.stringify(tx).includes(note.opening.randomness));
  assert.equal(tx.pq_signature.length / 2, 3309);
});

test('builder rejects unsafe amounts, missing keys and mismatched identities', () => {
  for (const amount of [0, -1, 0.1, NaN, Infinity, '7', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => buildShieldedTx({ ...input, amount }), /amount must be positive/);
  }
  for (const overrides of [
    { privateKey: undefined }, { privateKey: 'kms://demo' }, { recipientPublicKey: undefined },
    { senderTag: 'someone-else' }, { recipientTag: 'someone-else' },
    { randomness: 'weak' }, { requestId: '' }, { assetId: '' },
  ]) assert.throws(() => buildShieldedTx({ ...input, ...overrides }));
});
