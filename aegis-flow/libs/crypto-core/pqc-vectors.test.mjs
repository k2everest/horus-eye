import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decapsulate } from './pqc-wrapper.mjs';

const vectors = JSON.parse(readFileSync(new URL('./test-vectors/nist-acvp.json', import.meta.url)));
// ASN.1 DER framing only, for importing NIST raw test keys into OpenSSL.
function der(tag, bytes) {
  const length = bytes.length < 128 ? Buffer.from([bytes.length]) : Buffer.from([0x82, bytes.length >> 8, bytes.length & 255]);
  return Buffer.concat([Buffer.from([tag]), length, bytes]);
}

for (const vector of vectors.ml_dsa) {
  test(`NIST ACVP ${vector.algorithm} sigVer tcId=${vector.tcId} expected=${vector.testPassed}`, () => {
    const index = { 'ML-DSA-44': 17, 'ML-DSA-65': 18, 'ML-DSA-87': 19 }[vector.algorithm];
    const identifier = Buffer.from(`300b06096086480165030403${index.toString(16).padStart(2, '0')}`, 'hex');
    const spki = der(0x30, Buffer.concat([identifier, der(3, Buffer.concat([Buffer.from([0]), Buffer.from(vector.pk, 'hex')]))]));
    const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    const valid = crypto.verify(null, Buffer.from(vector.message, 'hex'), {
      key: publicKey, context: Buffer.from(vector.context, 'hex'),
    }, Buffer.from(vector.signature, 'hex'));
    assert.equal(valid, vector.testPassed);
  });
}

for (const vector of vectors.ml_kem) {
  test(`NIST ACVP ${vector.algorithm} decap tcId=${vector.tcId} ${vector.reason}`, () => {
    const index = { 'ML-KEM-512': 1, 'ML-KEM-768': 2, 'ML-KEM-1024': 3 }[vector.algorithm];
    const identifier = Buffer.from(`300b06096086480165030404${index.toString(16).padStart(2, '0')}`, 'hex');
    // PKCS8 PrivateKeyInfo containing the expanded-key OCTET STRING choice.
    const pkcs8 = der(0x30, Buffer.concat([Buffer.from('020100', 'hex'), identifier, der(4, der(4, Buffer.from(vector.dk, 'hex')))]));
    const key = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
    const result = decapsulate({ algorithm: vector.algorithm, recipientPrivateKey: key, ciphertext: vector.c.toLowerCase() });
    assert.equal(result.shared_secret.toString('hex'), vector.k.toLowerCase());
    result.shared_secret.fill(0);
  });
}
