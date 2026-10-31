import { buildTranscriptHash } from './canonical-transcript.mjs';
import { verifyDigest, SUPPORTED_SIG } from './pqc-wrapper.mjs';

export function validateShieldedTxV1({ tx, seenRequestIds = new Set() }) {
  const failedChecks = [];

  if (!tx) {
    return { valid: false, failed_checks: ['INVALID_ARGUMENT: tx ausente'], status_code: 'INVALID_ARGUMENT' };
  }

  if (!tx.request_id) failedChecks.push('INVALID_ARGUMENT: request_id ausente');
  if (!tx.sender_tag) failedChecks.push('INVALID_ARGUMENT: sender_tag ausente');
  if (!tx.recipient_tag) failedChecks.push('INVALID_ARGUMENT: recipient_tag ausente');
  if (!tx.output_commitment) failedChecks.push('INVALID_ARGUMENT: output_commitment ausente');
  if (!tx.amount || tx.amount <= 0) failedChecks.push('INVALID_ARGUMENT: amount inválido');
  if (!tx.signature_algorithm) failedChecks.push('FAILED_PRECONDITION: signature_algorithm ausente');
  if (!tx.pq_signature) failedChecks.push('FAILED_PRECONDITION: pq_signature ausente');
  if (!tx.pq_public_key) failedChecks.push('FAILED_PRECONDITION: pq_public_key ausente');

  if (tx.signature_algorithm && !SUPPORTED_SIG.includes(tx.signature_algorithm)) {
    failedChecks.push('FAILED_PRECONDITION: signature_algorithm não suportado');
  }

  if (tx.request_id && seenRequestIds.has(tx.request_id)) {
    failedChecks.push('FAILED_PRECONDITION: replay detectado por request_id');
  }

  const canonicalPayload = {
    request_id: tx.request_id,
    sender_tag: tx.sender_tag,
    recipient_tag: tx.recipient_tag,
    output_commitment: tx.output_commitment,
    asset_id: tx.asset_id,
    amount: tx.amount,
  };

  const transcriptHash = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload: canonicalPayload });

  if (tx.transcript_hash && tx.transcript_hash !== transcriptHash) {
    failedChecks.push('FAILED_PRECONDITION: transcript_hash inválido');
  }

  if (tx.tx_id && tx.tx_id !== transcriptHash) {
    failedChecks.push('FAILED_PRECONDITION: tx_id inválido');
  }

  if (failedChecks.length === 0) {
    const sigCheck = verifyDigest({
      algorithm: tx.signature_algorithm,
      publicKey: tx.pq_public_key,
      messageDigest: transcriptHash,
      signature: tx.pq_signature,
      domainTag: 'SIG_TX_V1',
    });

    if (!sigCheck.valid) {
      failedChecks.push(`FAILED_PRECONDITION: assinatura inválida (${sigCheck.reason})`);
    }
  }

  const valid = failedChecks.length === 0;
  if (valid && tx.request_id) seenRequestIds.add(tx.request_id);

  return {
    valid,
    failed_checks: failedChecks,
    status_code: valid ? 'OK' : 'FAILED_PRECONDITION',
    normalized_transcript_hash: transcriptHash,
  };
}
