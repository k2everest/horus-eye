import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  SUPPORTED_SIG, SUPPORTED_KEM, generateSigningKeyPair, generateKemKeyPair,
  signDigest, verifyDigest, encapsulate, decapsulate, exportPublicKey,
} from './pqc-wrapper.mjs';

const messageDigest = crypto.createHash('sha256').update('aegis test message').digest('hex');
const domainTag = 'SIG_TX_V1';
const tamper = value => `${value[0] === '0' ? '1' : '0'}${value.slice(1)}`;

for (const algorithm of SUPPORTED_SIG) {
  test(`${algorithm}: authentic signature; rejects changed digest/domain/key/signature`, () => {
    const pair = generateSigningKeyPair(algorithm);
    const other = generateSigningKeyPair(algorithm);
    const signed = signDigest({ algorithm, privateKey: pair.privateKey, messageDigest, domainTag });
    const input = { algorithm, publicKey: exportPublicKey(pair.publicKey), messageDigest, domainTag, signature: signed.signature };
    assert.equal(verifyDigest(input).valid, true);
    for (const change of [
      { signature: tamper(signed.signature) }, { signature: 'sig' }, { signature: signed.signature.slice(2) },
      { messageDigest: tamper(messageDigest) }, { domainTag: 'ANOTHER_DOMAIN' },
      { publicKey: other.publicKey }, { publicKey: 'pub-key-demo' },
      { messageDigest: 'abc123' }, { domainTag: 'SIG_TX_V1|bad' },
      { algorithm: 'ML-DSA-FAKE' },
    ]) assert.equal(verifyDigest({ ...input, ...change }).valid, false);
    assert.equal(signed.signature.length / 2, { 'ML-DSA-44': 2420, 'ML-DSA-65': 3309, 'ML-DSA-87': 4627 }[algorithm]);
    assert.throws(() => signDigest({ algorithm, privateKeyRef: 'kms://k1', messageDigest, domainTag }));
    assert.throws(() => signDigest({ algorithm, privateKey: pair.publicKey, messageDigest, domainTag }));
    const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const fromPem = signDigest({ algorithm, privateKey: privatePem, messageDigest, domainTag });
    assert.equal(verifyDigest({ ...input, signature: fromPem.signature }).valid, true);
    assert.equal(verifyDigest({ ...input, publicKey: privatePem }).valid, false);
  });
}

for (const algorithm of SUPPORTED_KEM) {
  test(`${algorithm}: randomized KEM agreement and implicit rejection`, () => {
    const pair = generateKemKeyPair(algorithm);
    const other = generateKemKeyPair(algorithm);
    const first = encapsulate({ algorithm, recipientPublicKey: exportPublicKey(pair.publicKey) });
    const second = encapsulate({ algorithm, recipientPublicKey: pair.publicKey });
    const opened = decapsulate({ algorithm, recipientPrivateKey: pair.privateKey, ciphertext: first.ciphertext });
    assert.deepEqual(opened.shared_secret, first.shared_secret);
    assert.equal(first.shared_secret.length, 32);
    assert.notEqual(first.ciphertext, second.ciphertext);
    assert.notDeepEqual(first.shared_secret, second.shared_secret);
    for (const input of [
      { recipientPrivateKey: other.privateKey, ciphertext: first.ciphertext },
      { recipientPrivateKey: pair.privateKey, ciphertext: tamper(first.ciphertext) },
    ]) {
      const rejected = decapsulate({ algorithm, ...input });
      assert.notDeepEqual(rejected.shared_secret, first.shared_secret);
      rejected.shared_secret.fill(0);
    }
    assert.throws(() => decapsulate({ algorithm, recipientPrivateKey: pair.privateKey, ciphertext: '00' }));
    assert.throws(() => encapsulate({ algorithm, recipientPublicKey: 'pub-key-demo' }));
    for (const item of [first, second, opened]) item.shared_secret.fill(0);
  });
}

test('algorithm confusion and classical fallback are rejected', () => {
  const pair = generateSigningKeyPair('ML-DSA-44');
  assert.throws(() => signDigest({ algorithm: 'ML-DSA-65', privateKey: pair.privateKey, messageDigest, domainTag }));
  assert.throws(() => generateSigningKeyPair('RSA'));
  assert.throws(() => generateKemKeyPair('X25519'));
  assert.equal(verifyDigest({ algorithm: 'ML-DSA-65', publicKey: pair.publicKey, messageDigest, domainTag, signature: '00' }).valid, false);
});
