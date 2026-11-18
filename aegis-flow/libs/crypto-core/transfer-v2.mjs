import crypto from 'node:crypto';
import { buildTranscriptHash, canonicalSerialize } from './canonical-transcript.mjs';
import { signDigest, verifyDigest, signerTag, exportPublicKey, kemRecipientTag, SUPPORTED_SIG, decodeHex } from './pqc-wrapper.mjs';
import { sealEnvelope, assertEnvelopeShape } from './sealed-envelope.mjs';
import { assertNoteV2, noteCommitmentV2, noteNullifierV2 } from './shielded-note-v2.mjs';
import { assertStarkStatement, STATEMENT_VERSION } from './stark-statement.mjs';

const PAYLOAD_FIELDS = ['crypto_version', 'network_id', 'request_id', 'anchor_state_root', 'input_commitments', 'output_commitments', 'nullifiers', 'public_amount', 'public_asset_id', 'encrypted_outputs', 'sender_tag', 'pq_public_key', 'signature_algorithm'];
const FIELDS = [...PAYLOAD_FIELDS, 'tx_id', 'pq_signature'];
const contextFor = (network, request, index) => `NOTE_OUTPUT_V2:${network}:${request}:${index}`;
const transcript = payload => buildTranscriptHash({ domainTag: 'SIG_TRANSFER_V2', payload });

export function statementForTransfer(transaction) {
  const statement = {
    version: STATEMENT_VERSION, network_id: transaction.network_id,
    anchor_state_root: transaction.anchor_state_root,
    input_commitments: transaction.input_commitments,
    output_commitments: transaction.output_commitments,
    nullifiers: transaction.nullifiers, public_amount: transaction.public_amount,
    public_asset_id: transaction.public_asset_id, transaction_binding: transaction.tx_id,
  };
  assertStarkStatement(statement);
  return statement;
}

// Local prover preparation. The witness MUST NOT be sent to the gateway.
export function prepareTransferV2({ requestId, networkId = 'aegis-lab-v1', anchorStateRoot, inputs, outputs,
  privateKey, fee = 0, signatureAlgorithm = 'ML-DSA-65', kemAlgorithm = 'ML-KEM-768' }) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new TypeError('invalid requestId');
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 4 || !Array.isArray(outputs) || !outputs.length || outputs.length > 4) throw new TypeError('one to four inputs/outputs required');
  if (!(privateKey instanceof crypto.KeyObject) || privateKey.type !== 'private') throw new TypeError('private signing key required');
  if (!Number.isSafeInteger(fee) || fee < 0) throw new TypeError('invalid fee');
  const publicKey = crypto.createPublicKey(privateKey);
  const asset = inputs[0].note.asset_id;
  let totalIn = 0n;
  let totalOut = BigInt(fee);
  for (const input of inputs) {
    assertNoteV2(input.note);
    if (input.note.asset_id !== asset) throw new Error('ASSET_MISMATCH');
    totalIn += BigInt(input.note.value);
  }
  const encryptedOutputs = outputs.map(({ note, recipientPublicKey }, index) => {
    assertNoteV2(note);
    if (note.asset_id !== asset) throw new Error('ASSET_MISMATCH');
    totalOut += BigInt(note.value);
    const bytes = Buffer.from(canonicalSerialize(note));
    try {
      return { recipient_tag: kemRecipientTag(recipientPublicKey, kemAlgorithm), envelope: sealEnvelope({
        plaintext: bytes, recipientPublicKey, algorithm: kemAlgorithm,
        context: contextFor(networkId, requestId, index),
      }) };
    } finally { bytes.fill(0); }
  });
  if (totalIn !== totalOut) throw new Error('BALANCE_NOT_CONSERVED');
  const payload = {
    crypto_version: 'AEGIS-TRANSFER-V2', network_id: networkId, request_id: requestId,
    anchor_state_root: anchorStateRoot,
    input_commitments: inputs.map(input => noteCommitmentV2(input.note)),
    output_commitments: outputs.map(output => noteCommitmentV2(output.note)),
    nullifiers: inputs.map(input => noteNullifierV2(input.note, input.spend_secret)),
    public_amount: fee, public_asset_id: asset, encrypted_outputs: encryptedOutputs,
    sender_tag: signerTag(publicKey, signatureAlgorithm), pq_public_key: exportPublicKey(publicKey), signature_algorithm: signatureAlgorithm,
  };
  const txId = transcript(payload);
  const transaction = { ...payload, tx_id: txId, pq_signature: signDigest({ algorithm: signatureAlgorithm, privateKey, messageDigest: txId, domainTag: 'SIG_TRANSFER_V2' }).signature };
  const statement = statementForTransfer(transaction);
  return {
    transaction, statement,
    witness: { inputs: inputs.map(input => ({ note: input.note, spend_secret: input.spend_secret, membership: input.membership })), outputs: outputs.map(output => output.note) },
  };
}

export function verifyTransferSignature(transaction) {
  try {
    if (!transaction || typeof transaction !== 'object' || Object.keys(transaction).length !== FIELDS.length || FIELDS.some(field => !Object.hasOwn(transaction, field))) return false;
    if (transaction.crypto_version !== 'AEGIS-TRANSFER-V2' || typeof transaction.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(transaction.request_id)) return false;
    statementForTransfer(transaction);
    if (!SUPPORTED_SIG.includes(transaction.signature_algorithm) || typeof transaction.pq_public_key !== 'string' || transaction.pq_public_key.length > 8192 || typeof transaction.pq_signature !== 'string' || transaction.pq_signature.length > 10000) return false;
    if (signerTag(transaction.pq_public_key, transaction.signature_algorithm) !== transaction.sender_tag) return false;
    if (!Array.isArray(transaction.encrypted_outputs) || transaction.encrypted_outputs.length !== transaction.output_commitments.length) return false;
    for (const [index, output] of transaction.encrypted_outputs.entries()) {
      if (!output || Object.keys(output).sort().join(',') !== 'envelope,recipient_tag' || !/^aegis_kem1_[0-9a-f]{64}$/.test(output.recipient_tag)) return false;
      assertEnvelopeShape(output.envelope);
      if (output.envelope.context !== contextFor(transaction.network_id, transaction.request_id, index)) return false;
    }
    decodeHex(transaction.tx_id, 'tx_id', 32);
    const payload = Object.fromEntries(PAYLOAD_FIELDS.map(field => [field, transaction[field]]));
    const digest = transcript(payload);
    return digest === transaction.tx_id && verifyDigest({ algorithm: transaction.signature_algorithm, publicKey: transaction.pq_public_key, messageDigest: digest, domainTag: 'SIG_TRANSFER_V2', signature: transaction.pq_signature }).valid;
  } catch { return false; }
}
