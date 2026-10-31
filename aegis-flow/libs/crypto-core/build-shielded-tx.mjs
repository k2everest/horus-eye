import { buildTranscriptHash } from './canonical-transcript.mjs';
import { createNote } from './note-model.mjs';
import { signDigest } from './pqc-wrapper.mjs';

export function buildShieldedTx({
  requestId,
  senderTag,
  recipientTag,
  assetId = 'AEGIS',
  amount,
  randomness,
  signatureAlgorithm = 'ML-DSA-65',
  privateKeyRef = 'kms://tx-signer-v1',
}) {
  if (!requestId) throw new Error('requestId is required');
  if (!senderTag) throw new Error('senderTag is required');
  if (!recipientTag) throw new Error('recipientTag is required');
  if (!amount || amount <= 0) throw new Error('amount must be positive');
  if (!randomness) throw new Error('randomness is required');

  const note = createNote({
    ownerTag: recipientTag,
    value: amount,
    randomness,
    assetId,
  });

  const txPayload = {
    request_id: requestId,
    sender_tag: senderTag,
    recipient_tag: recipientTag,
    output_commitment: note.commitment,
    asset_id: assetId,
    amount,
  };

  const transcriptHash = buildTranscriptHash({
    domainTag: 'SIG_TX_V1',
    payload: txPayload,
  });

  const sig = signDigest({
    algorithm: signatureAlgorithm,
    privateKeyRef,
    messageDigest: transcriptHash,
    domainTag: 'SIG_TX_V1',
  });

  return {
    tx_id: transcriptHash,
    request_id: requestId,
    output_note: note,
    transcript_hash: transcriptHash,
    pq_signature: sig.signature,
    signature_algorithm: sig.signature_algorithm,
    failed_checks: [],
  };
}
