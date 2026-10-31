import test from 'node:test';
import assert from 'node:assert/strict';
import { encapsulate, signDigest, verifyDigest } from './pqc-wrapper.mjs';

test('signDigest deve aceitar ML-DSA-65', () => {
  const out = signDigest({
    algorithm: 'ML-DSA-65',
    privateKeyRef: 'kms://k1',
    messageDigest: 'abc123',
    domainTag: 'SIG_TX_V1',
  });

  assert.equal(out.signature_algorithm, 'ML-DSA-65');
  assert.ok(out.signature.length > 0);
});

test('encapsulate deve aceitar ML-KEM-768', () => {
  const out = encapsulate({
    algorithm: 'ML-KEM-768',
    recipientPublicKey: 'pub-key',
    context: 'ctx',
  });

  assert.equal(out.kem_algorithm, 'ML-KEM-768');
  assert.ok(out.ciphertext.length > 0);
  assert.ok(out.shared_secret.length > 0);
});

test('verifyDigest MVP retorna válido em envelope coerente', () => {
  const out = verifyDigest({
    algorithm: 'ML-DSA-65',
    publicKey: 'pub',
    messageDigest: 'abc123',
    signature: 'sig',
    domainTag: 'SIG_TX_V1',
  });

  assert.equal(out.valid, true);
});
