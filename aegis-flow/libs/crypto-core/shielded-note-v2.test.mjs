import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpendIdentity, createPrivateNote, noteCommitmentV2, noteNullifierV2 } from './shielded-note-v2.mjs';
import { createInclusionProof, merkleRoot } from './merkle-proof.mjs';
import { prepareTransferV2, verifyTransferSignature, statementForTransfer } from './transfer-v2.mjs';
import { generateSigningKeyPair, generateKemKeyPair } from './pqc-wrapper.mjs';
import { openEnvelope } from './sealed-envelope.mjs';

function fixture() {
  const owner = createSpendIdentity(); const recipient = createSpendIdentity();
  const note = createPrivateNote({ ownerTag: owner.owner_tag, value: 8 });
  const output = createPrivateNote({ ownerTag: recipient.owner_tag, value: 7 });
  const commitments = [noteCommitmentV2(note)];
  const signer = generateSigningKeyPair(); const kem = generateKemKeyPair();
  const args = { requestId: 'transfer-test', anchorStateRoot: merkleRoot(commitments), fee: 1,
    privateKey: signer.privateKey, inputs: [{ note, spend_secret: owner.spend_secret, membership: createInclusionProof(commitments, 0) }],
    outputs: [{ note: output, recipientPublicKey: kem.publicKey }] };
  return { owner, recipient, note, output, kem, args };
}

test('v2 commitments bind every private field; nullifiers require the spend secret', () => {
  const { note, owner } = fixture();
  const commitment = noteCommitmentV2(note);
  assert.equal(commitment.length, 64);
  assert.equal(noteNullifierV2(note, owner.spend_secret), noteNullifierV2(note, owner.spend_secret));
  assert.throws(() => noteNullifierV2(note, createSpendIdentity().spend_secret), /DOES_NOT_OWN/);
  for (const change of [{ value: 9 }, { asset_id: 'OTHER' }, { randomness: '1'.repeat(64) }, { owner_tag: '0'.repeat(64) }]) {
    assert.notEqual(noteCommitmentV2({ ...note, ...change }), commitment);
  }
  for (const value of [0, -1, 0.1, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => createPrivateNote({ ownerTag: owner.owner_tag, value }));
});

test('public transfer hides note values/openings and signs the proof binding plus encrypted outputs', () => {
  const { args, kem, output, owner } = fixture();
  const { transaction, statement, witness } = prepareTransferV2(args);
  assert.equal(verifyTransferSignature(transaction), true);
  assert.equal(statement.transaction_binding, transaction.tx_id);
  assert.deepEqual(statementForTransfer(transaction), statement);
  const publicBody = JSON.stringify(transaction);
  assert.ok(!publicBody.includes(owner.spend_secret));
  assert.ok(!publicBody.includes(output.randomness));
  assert.equal(transaction.public_amount, 1);
  const plaintext = openEnvelope({ envelope: transaction.encrypted_outputs[0].envelope, recipientPrivateKey: kem.privateKey,
    expectedContext: 'NOTE_OUTPUT_V2:aegis-lab-v1:transfer-test:0' });
  assert.deepEqual(JSON.parse(plaintext.toString()), output); plaintext.fill(0);
  assert.equal(witness.inputs.length, 1);
  for (const change of [{ public_amount: 2 }, { request_id: 'other' }, { anchor_state_root: '0'.repeat(64) }, { network_id: 'other' }, { input_commitments: [] }, { witness }]) {
    assert.equal(verifyTransferSignature({ ...transaction, ...change }), false);
  }
  assert.throws(() => prepareTransferV2({ ...args, fee: 2 }), /BALANCE_NOT_CONSERVED/);
});
