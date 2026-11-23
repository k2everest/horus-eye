import assert from 'node:assert/strict';
import { generateSigningKeyPair, generateKemKeyPair } from '../libs/crypto-core/pqc-wrapper.mjs';
import { buildShieldedTx } from '../libs/crypto-core/build-shielded-tx.mjs';
import { openEnvelope } from '../libs/crypto-core/sealed-envelope.mjs';

const baseUrl = process.argv[2] || 'http://127.0.0.1:8080';
const signer = generateSigningKeyPair();
const recipient = generateKemKeyPair();
const tx = buildShieldedTx({
  requestId: 'smoke-crypto', amount: 1,
  privateKey: signer.privateKey, recipientPublicKey: recipient.publicKey,
});
const submit = body => fetch(`${baseUrl}/validate`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
});
const valid = await submit(tx);
assert.equal(valid.status, 200);
const response = await valid.json();
assert.equal(response.valid, true);
assert.equal(response.production_ready, false);
assert.equal(response.validation_scope, 'signature-and-structure-only');
const note = openEnvelope({
  envelope: tx.encrypted_output, recipientPrivateKey: recipient.privateKey,
  expectedContext: 'NOTE_OUTPUT_V1:smoke-crypto',
});
try {
  assert.equal(JSON.parse(note.toString()).value, 1);
} finally {
  note.fill(0);
}
const tampered = await submit({ ...tx, amount: 2 });
assert.equal(tampered.status, 400);
assert.equal((await tampered.json()).valid, false);
console.log('Crypto smoke: real signature accepted, encrypted note recovered, tampered transaction rejected. Production remains blocked.');
