import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShieldedTx } from './build-shielded-tx.mjs';
import { validateShieldedTxV1 } from './validate-shielded-tx.mjs';
import { generateSigningKeyPair, generateKemKeyPair, exportPublicKey, signDigest, signerTag } from './pqc-wrapper.mjs';
import { buildTranscriptHash } from './canonical-transcript.mjs';

const signer = generateSigningKeyPair();
const recipient = generateKemKeyPair();
const build = () => buildShieldedTx({ requestId: 'req-v-1', amount: 10, privateKey: signer.privateKey, recipientPublicKey: recipient.publicKey });
const flip = value => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;

test('real signature accepted, successful request replay rejected', () => {
  const tx = build();
  const seen = new Set();
  const out = validateShieldedTxV1({ tx, seenRequestIds: seen });
  assert.equal(out.valid, true);
  assert.equal(out.production_ready, false);
  assert.equal(out.validation_scope, 'signature-and-structure-only');
  const replay = validateShieldedTxV1({ tx, seenRequestIds: seen });
  assert.equal(replay.valid, false);
  assert.ok(replay.failed_checks.some(x => x.includes('replay')));
});

test('changed signed fields, ciphertext and malformed legacy transactions are rejected', () => {
  const tx = build();
  for (const change of [
    { amount: 11 }, { request_id: 'other' }, { asset_id: 'OTHER' },
    { sender_tag: 'sender-a' }, { recipient_tag: flip(tx.recipient_tag) },
    { tx_id: flip(tx.tx_id) }, { transcript_hash: flip(tx.transcript_hash) },
    { pq_signature: flip(tx.pq_signature) }, { pq_public_key: 'pub-key-demo' },
    { encrypted_output: { ...tx.encrypted_output, ciphertext: flip(tx.encrypted_output.ciphertext) } },
    { crypto_version: undefined }, { pq_signature: 'sig' }, { opening: 'leaked' },
    { amount: NaN }, { encrypted_output: null },
  ]) {
    const seen = new Set();
    assert.equal(validateShieldedTxV1({ tx: { ...tx, ...change }, seenRequestIds: seen }).valid, false);
    assert.equal(seen.size, 0);
  }
  for (const malformed of [null, [], 'tx', {}, true]) assert.equal(validateShieldedTxV1({ tx: malformed }).valid, false);
});

test('recomputing transcript cannot bypass signature verification or impersonate a sender', () => {
  const tx = build();
  const { tx_id, transcript_hash, pq_signature, ...payload } = tx;
  payload.amount = 99;
  const digest = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload });
  assert.equal(validateShieldedTxV1({ tx: { ...payload, tx_id: digest, transcript_hash: digest, pq_signature } }).valid, false);
  const attacker = generateSigningKeyPair();
  payload.pq_public_key = exportPublicKey(attacker.publicKey);
  const attackerDigest = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload });
  const signature = signDigest({ algorithm: 'ML-DSA-65', privateKey: attacker.privateKey, messageDigest: attackerDigest, domainTag: 'SIG_TX_V1' }).signature;
  assert.notEqual(signerTag(attacker.publicKey), payload.sender_tag);
  assert.equal(validateShieldedTxV1({ tx: { ...payload, tx_id: attackerDigest, transcript_hash: attackerDigest, pq_signature: signature } }).valid, false);
});
