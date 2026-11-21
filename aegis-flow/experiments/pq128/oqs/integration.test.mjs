// This suite must run against a locally built, real pinned liboqs. Enabling it
// makes an absent/mismatched build a failure, never a silent skip or fallback.
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {inspect} from 'node:util';
import {bindingFrame512, transcriptDigest512, signTranscript512, verifyTranscript512} from '../bindings.mjs';
import {OqsLaboratoryBackend, OQS_VERSION, OQS_SIZES, OQS_ALGORITHMS, nodePublicKeyToRaw, rawPublicKeyToNode} from './backend.mjs';
const enabled = process.env.AEGIS_OQS_INTEGRATION === '1';
const publicReport = {
  liboqs_version:OQS_VERSION, node_version:process.versions.node, sizes:OQS_SIZES,
  checks:{
    genuine_build_metadata:false,
    c_signature_verified_by_node:false, node_signature_verified_by_c:false,
    changed_signature_rejected:false, changed_message_rejected:false, wrong_signature_key_rejected:false,
    kem_shared_secret_agreement:false, changed_ciphertext_implicit_rejection:false, wrong_kem_recipient_rejected:false,
    shared_secret_serialization_blocked:false, owned_shared_secret_cleared:false,
  },
  aegis_target_met:false, production_ready:false,
};

after(() => {
  const output = process.env.AEGIS_OQS_PUBLIC_ARTIFACT;
  if (!enabled || !output || !Object.values(publicReport.checks).every(value => value === true)) return;
  // Explicitly enumerated booleans, versions and byte sizes only. Never attach
  // operation objects, public keys, signatures, ciphertexts or shared secrets.
  writeFileSync(output, `${JSON.stringify(publicReport, null, 2)}\n`, {flag:'wx', mode:0o644});
});

async function realBackend() {
  const backend = new OqsLaboratoryBackend();
  assert.equal(backend.available(), true, 'AEGIS_OQS_INTEGRATION=1 requires the genuine pinned local liboqs build; run oqs/build.py first');
  const metadata = await backend.metadata();
  assert.equal(metadata.liboqs_version, OQS_VERSION);
  assert.deepEqual(metadata.allowed_algorithms, OQS_ALGORITHMS);
  assert.deepEqual(metadata.sizes, OQS_SIZES);
  assert.equal(metadata.aegis_target_met, false); assert.equal(metadata.production_ready, false);
  publicReport.checks.genuine_build_metadata = true;
  return backend;
}
function signedFrame(signed) {
  return bindingFrame512({domain:'SIGNED_TRANSCRIPT', parts:[Buffer.from(signed.domain, 'ascii'),
    Buffer.from(signed.transcript_digest, 'hex'), Buffer.from(signed.signer_tag, 'hex')]});
}

test('real liboqs and Node ML-DSA-87 verify each other on application-framed SHA-512 transcripts', {skip:!enabled, timeout:60000}, async () => {
  const backend = await realBackend();
  const payload = Buffer.from('isolated liboqs laboratory transcript; not a node-admission proof');
  const message = bindingFrame512({domain:'OQS_INTEROP', parts:[Buffer.from(transcriptDigest512({domain:'OQS_INTEROP', payload}), 'hex')]});
  const sample = await backend.sampleSignature({message});
  assert.equal(sample.signature_algorithm, 'ML-DSA-87');
  assert.deepEqual(Object.keys(sample).sort(), ['aegis_target_met','production_ready','publicKey','signature','signature_algorithm']);
  const cPublicKey = rawPublicKeyToNode({algorithm:'ML-DSA-87', publicKey:sample.publicKey});
  assert.equal(crypto.verify(null, message, cPublicKey, sample.signature), true, 'Node must verify the genuine C-generated signature');
  assert.equal((await backend.verifyRaw({publicKey:sample.publicKey, message, signature:sample.signature})).valid, true);
  publicReport.checks.c_signature_verified_by_node = true;
  const wrongMessage = Buffer.from(message); wrongMessage[wrongMessage.length - 1] ^= 1;
  const badSignature = Buffer.from(sample.signature); badSignature[0] ^= 1;
  assert.equal(crypto.verify(null, wrongMessage, cPublicKey, sample.signature), false);
  assert.equal(crypto.verify(null, message, cPublicKey, badSignature), false);
  assert.equal((await backend.verifyRaw({publicKey:sample.publicKey, message:wrongMessage, signature:sample.signature})).valid, false);
  assert.equal((await backend.verifyRaw({publicKey:sample.publicKey, message, signature:badSignature})).valid, false);

  const pair = crypto.generateKeyPairSync('ml-dsa-87');
  const rawNodePublicKey = nodePublicKeyToRaw({algorithm:'ML-DSA-87', publicKey:pair.publicKey});
  assert.equal((await backend.verifyRaw({publicKey:rawNodePublicKey, message, signature:sample.signature})).valid, false);
  assert.equal(crypto.verify(null, message, pair.publicKey, sample.signature), false);
  const signed = signTranscript512({domain:'OQS_INTEROP', payload, privateKey:pair.privateKey});
  assert.equal(verifyTranscript512({domain:'OQS_INTEROP', payload, publicKey:pair.publicKey, signed}), true);
  const nodeMessage = signedFrame(signed), signature = Buffer.from(signed.signature, 'hex');
  assert.equal((await backend.verifyRaw({publicKey:rawNodePublicKey, message:nodeMessage, signature})).valid, true,
    'liboqs must verify the existing experimental Node transcript signature');
  publicReport.checks.node_signature_verified_by_c = true;
  const changed = signedFrame({...signed, transcript_digest:transcriptDigest512({domain:'OQS_INTEROP', payload:Buffer.from('changed transcript')})});
  assert.equal((await backend.verifyRaw({publicKey:rawNodePublicKey, message:changed, signature})).valid, false);
  assert.equal((await backend.verifyRaw({publicKey:sample.publicKey, message:nodeMessage, signature})).valid, false);
  const changedNodeSignature = Buffer.from(signature); changedNodeSignature[changedNodeSignature.length - 1] ^= 1;
  assert.equal((await backend.verifyRaw({publicKey:rawNodePublicKey, message:nodeMessage, signature:changedNodeSignature})).valid, false);
  publicReport.checks.changed_signature_rejected = true;
  publicReport.checks.changed_message_rejected = true;
  publicReport.checks.wrong_signature_key_rejected = true;
});

test('real liboqs ML-KEM-1024 encapsulation interoperates with Node decapsulation and implicit rejection', {skip:!enabled, timeout:60000}, async () => {
  const backend = await realBackend();
  const pair = crypto.generateKeyPairSync('ml-kem-1024');
  let result, ownedSecret, opened, rejected, rejectedAgain, wrongRecipientSecret;
  try {
    result = await backend.encapsulateNodePublicKey({publicKey:pair.publicKey});
    ownedSecret = result.shared_secret;
    assert.equal(result.ciphertext.length, 1568); assert.equal(result.shared_secret.length, 32);
    assert.equal(result.aegis_target_met, false); assert.equal(result.production_ready, false);
    opened = crypto.decapsulate(pair.privateKey, result.ciphertext);
    // Never put actual shared-secret Buffers into assertion diagnostics or logs.
    assert.equal(crypto.timingSafeEqual(opened, result.shared_secret), true, 'Node/liboqs KEM secret agreement failed');
    publicReport.checks.kem_shared_secret_agreement = true;
    const tampered = Buffer.from(result.ciphertext); tampered[0] ^= 1;
    rejected = crypto.decapsulate(pair.privateKey, tampered);
    assert.equal(rejected.length, 32);
    assert.equal(crypto.timingSafeEqual(rejected, result.shared_secret), false, 'tampered ciphertext must not recover the original secret');
    rejectedAgain = crypto.decapsulate(pair.privateKey, tampered);
    assert.equal(crypto.timingSafeEqual(rejectedAgain, rejected), true, 'implicit rejection must be deterministic for the same changed ciphertext');
    publicReport.checks.changed_ciphertext_implicit_rejection = true;
    const wrongRecipient = crypto.generateKeyPairSync('ml-kem-1024');
    wrongRecipientSecret = crypto.decapsulate(wrongRecipient.privateKey, result.ciphertext);
    assert.equal(crypto.timingSafeEqual(wrongRecipientSecret, result.shared_secret), false);
    publicReport.checks.wrong_kem_recipient_rejected = true;
    assert.equal(Object.keys(result).includes('shared_secret'), false);
    assert.match(inspect(result), /shared_secret: \[REDACTED\]/);
    assert.throws(() => JSON.stringify(result), /PRIVATE_OQS_SHARED_SECRET_NOT_SERIALIZABLE/);
    publicReport.checks.shared_secret_serialization_blocked = true;
  } finally {
    opened?.fill(0); rejected?.fill(0); rejectedAgain?.fill(0); wrongRecipientSecret?.fill(0); result?.dispose();
  }
  assert.throws(() => result.shared_secret, /OQS_SHARED_SECRET_DISPOSED/);
  assert.equal(ownedSecret.every(byte => byte === 0), true);
  publicReport.checks.owned_shared_secret_cleared = true;
});
