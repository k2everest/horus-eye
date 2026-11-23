import test from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_KEM, generateKemKeyPair } from './pqc-wrapper.mjs';
import { sealEnvelope, openEnvelope } from './sealed-envelope.mjs';

const flip = value => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;
for (const algorithm of SUPPORTED_KEM) {
  test(`${algorithm}: KEM/HKDF/AES-GCM encrypts and authenticates each field`, () => {
    const keys = generateKemKeyPair(algorithm);
    const wrong = generateKemKeyPair(algorithm);
    const plaintext = Buffer.from('private note, opening and memo \u0000\u00e9');
    const context = 'NOTE_OUTPUT_V1:request1';
    const envelope = sealEnvelope({ plaintext, recipientPublicKey: keys.publicKey, algorithm, context });
    assert.deepEqual(openEnvelope({ envelope, recipientPrivateKey: keys.privateKey, expectedContext: context }), plaintext);
    const another = sealEnvelope({ plaintext, recipientPublicKey: keys.publicKey, algorithm, context });
    assert.notEqual(envelope.kem_ciphertext, another.kem_ciphertext);
    assert.notEqual(envelope.ciphertext, another.ciphertext);
    assert.ok(!JSON.stringify(envelope).includes('private note'));
    for (const change of [
      ...['kem_ciphertext', 'nonce', 'ciphertext', 'auth_tag'].map(field => ({ [field]: flip(envelope[field]) })),
      { context: 'different' }, { version: 'AEGIS-SEALED-V0' }, { kem_algorithm: 'ML-KEM-FAKE' },
      { nonce: '00' }, { auth_tag: '00' }, { extra: true }, { ciphertext: 'zz' },
    ]) assert.throws(() => openEnvelope({ envelope: { ...envelope, ...change }, recipientPrivateKey: keys.privateKey, expectedContext: context }), /ENVELOPE_AUTHENTICATION_FAILED/);
    assert.throws(() => openEnvelope({ envelope, recipientPrivateKey: wrong.privateKey, expectedContext: context }), /ENVELOPE_AUTHENTICATION_FAILED/);
    assert.throws(() => openEnvelope({ envelope, recipientPrivateKey: keys.privateKey, expectedContext: 'other' }), /ENVELOPE_AUTHENTICATION_FAILED/);
    assert.throws(() => openEnvelope({ envelope, recipientPrivateKey: keys.privateKey }), /ENVELOPE_AUTHENTICATION_FAILED/);
    assert.throws(() => sealEnvelope({ plaintext: Buffer.alloc(65537), recipientPublicKey: keys.publicKey, context }));
    assert.throws(() => sealEnvelope({ plaintext: Buffer.alloc(0), recipientPublicKey: keys.publicKey, context }));
  });
}
