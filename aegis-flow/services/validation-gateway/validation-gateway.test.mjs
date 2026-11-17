import test from 'node:test';
import assert from 'node:assert/strict';
import { validateShieldedTx } from './index.mjs';
import { signedRequest } from './test-fixtures.mjs';

test('real transaction signature is verified and public envelope is never logged', () => {
  const logs = [];
  const request = signedRequest('req-123');
  const response = validateShieldedTx(request, line => logs.push(line));
  assert.equal(response.valid, true);
  assert.equal(response.production_ready, false);
  assert.equal(response.validation_scope, 'signature-and-structure-only');
  assert.equal(logs.length, 2);
  for (const line of logs) {
    const entry = JSON.parse(line);
    assert.equal(entry.request_id, 'req-123');
    assert.equal(entry.method, 'ValidateShieldedTx');
    assert.ok(entry.tx_id_hash);
    for (const field of ['tx_blob', 'pq_public_key', 'pq_signature', 'encrypted_output']) assert.equal(field in entry, false);
    assert.ok(!line.includes(request.pq_signature));
    assert.ok(!line.includes(request.encrypted_output.ciphertext));
  }
});

test('gateway rejects legacy demo envelopes and tampered signatures', () => {
  assert.equal(validateShieldedTx({
    tx_blob: '0123456789abcdef', pq_signature: 'sig', pq_public_key: 'pk',
    kem_ciphertext: 'ct', signature_algorithm: 'ML-DSA-65', kem_algorithm: 'ML-KEM-768',
  }, () => {}).valid, false);
  const request = signedRequest();
  request.pq_signature = `${request.pq_signature[0] === '0' ? '1' : '0'}${request.pq_signature.slice(1)}`;
  assert.equal(validateShieldedTx(request, () => {}).valid, false);
});
