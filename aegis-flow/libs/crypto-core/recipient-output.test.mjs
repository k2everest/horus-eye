import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpendIdentity, createPrivateNote, noteCommitmentV2 } from './shielded-note-v2.mjs';
import { prepareTransferV2, openTransferOutputV2, verifyTransferSignature } from './transfer-v2.mjs';
import { merkleRoot, createInclusionProof } from './merkle-proof.mjs';
import { generateSigningKeyPair, generateKemKeyPair, signDigest } from './pqc-wrapper.mjs';
import { sealEnvelope } from './sealed-envelope.mjs';
import { buildTranscriptHash } from './canonical-transcript.mjs';

function fixture() {
  const owner = createSpendIdentity(); const recipient = createSpendIdentity();
  const input = createPrivateNote({ ownerTag: owner.owner_tag, value: 8 });
  const output = createPrivateNote({ ownerTag: recipient.owner_tag, value: 7 });
  const commitments = [noteCommitmentV2(input)];
  const signer = generateSigningKeyPair(); const kem = generateKemKeyPair();
  const { transaction } = prepareTransferV2({ requestId: 'recipient-audit', anchorStateRoot: merkleRoot(commitments),
    fee: 1, privateKey: signer.privateKey,
    inputs: [{ note: input, spend_secret: owner.spend_secret, membership: createInclusionProof(commitments, 0) }],
    outputs: [{ note: output, recipientPublicKey: kem.publicKey }] });
  return { transaction, output, recipient, signer, kem };
}
function resign(transaction, privateKey) {
  const { tx_id, pq_signature, ...payload } = transaction;
  const digest = buildTranscriptHash({ domainTag: 'SIG_TRANSFER_V2', payload });
  return { ...payload, tx_id: digest, pq_signature: signDigest({ algorithm: transaction.signature_algorithm,
    privateKey, messageDigest: digest, domainTag: 'SIG_TRANSFER_V2' }).signature };
}

test('recipient verifies signature, KEM identity, note commitment and spend ownership without confirming funds', () => {
  const { transaction, output, recipient, kem } = fixture();
  const result = openTransferOutputV2({ transaction, index: 0, recipientPrivateKey: kem.privateKey, spendSecret: recipient.spend_secret });
  assert.deepEqual(result.note, output);
  assert.equal(result.commitment, transaction.output_commitments[0]);
  assert.equal(result.confirmed, false);
  for (const change of [{ index: -1 }, { index: 1 }, { spendSecret: createSpendIdentity().spend_secret },
    { recipientPrivateKey: generateKemKeyPair().privateKey }, { transaction: { ...transaction, public_amount: 9 } }]) {
    assert.throws(() => openTransferOutputV2({ transaction, index: 0, recipientPrivateKey: kem.privateKey, spendSecret: recipient.spend_secret, ...change }), /OUTPUT_NOTE_AUTHENTICATION_FAILED/);
  }
});

test('valid ML-DSA and AEAD do not allow importing a different plaintext as the committed note', () => {
  const { transaction, output, recipient, signer, kem } = fixture();
  const wrongNote = { ...output, value: 700 };
  const envelope = sealEnvelope({ plaintext: Buffer.from(JSON.stringify(wrongNote)), recipientPublicKey: kem.publicKey,
    context: transaction.encrypted_outputs[0].envelope.context });
  const signed = resign({ ...transaction, encrypted_outputs: [{ ...transaction.encrypted_outputs[0], envelope }] }, signer.privateKey);
  assert.equal(verifyTransferSignature(signed), true);
  assert.throws(() => openTransferOutputV2({ transaction: signed, index: 0, recipientPrivateKey: kem.privateKey, spendSecret: recipient.spend_secret }), /OUTPUT_NOTE_AUTHENTICATION_FAILED/);
});
