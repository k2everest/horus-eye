import { buildTranscriptHash } from './canonical-transcript.mjs';
import { verifyDigest, signerTag, SUPPORTED_SIG, CRYPTO_VERSION } from './pqc-wrapper.mjs';
import { assertEnvelopeShape } from './sealed-envelope.mjs';

const PAYLOAD_FIELDS = [
  'crypto_version', 'request_id', 'sender_tag', 'recipient_tag', 'output_commitment',
  'asset_id', 'amount', 'signature_algorithm', 'pq_public_key', 'encrypted_output',
];
const TX_FIELDS = [...PAYLOAD_FIELDS, 'tx_id', 'transcript_hash', 'pq_signature'];

export function validateShieldedTxV1({ tx, seenRequestIds = new Set() }) {
  const failedChecks = [];
  const fail = message => failedChecks.push(`FAILED_PRECONDITION: ${message}`);
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) {
    return { valid: false, failed_checks: ['INVALID_ARGUMENT: tx ausente ou inválida'], status_code: 'INVALID_ARGUMENT' };
  }
  try {
    if (Object.keys(tx).length !== TX_FIELDS.length || TX_FIELDS.some(field => !Object.hasOwn(tx, field))) fail('schema inválido');
    if (tx.crypto_version !== CRYPTO_VERSION) fail('crypto_version inválida');
    if (typeof tx.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(tx.request_id)) fail('request_id inválido');
    if (typeof tx.asset_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(tx.asset_id)) fail('asset_id inválido');
    if (typeof tx.recipient_tag !== 'string' || !/^aegis_kem1_[0-9a-f]{64}$/.test(tx.recipient_tag)) fail('recipient_tag inválido');
    if (typeof tx.output_commitment !== 'string' || !/^[0-9a-f]{64}$/.test(tx.output_commitment)) fail('output_commitment inválido');
    if (!Number.isSafeInteger(tx.amount) || tx.amount <= 0) fail('amount inválido');
    if (!SUPPORTED_SIG.includes(tx.signature_algorithm)) fail('signature_algorithm não suportado');
    if (typeof tx.pq_public_key !== 'string' || tx.pq_public_key.length > 8192) fail('pq_public_key inválida');
    if (typeof tx.pq_signature !== 'string' || tx.pq_signature.length > 10000) fail('pq_signature inválida');
    if (seenRequestIds.has(tx.request_id)) fail('replay detectado por request_id');
    assertEnvelopeShape(tx.encrypted_output);
    if (tx.encrypted_output.context !== `NOTE_OUTPUT_V1:${tx.request_id}`) fail('contexto da note inválido');
    if (failedChecks.length === 0 && signerTag(tx.pq_public_key, tx.signature_algorithm) !== tx.sender_tag) fail('sender_tag não corresponde à chave');
    if (failedChecks.length === 0) {
      const payload = Object.fromEntries(PAYLOAD_FIELDS.map(field => [field, tx[field]]));
      const digest = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload });
      if (tx.transcript_hash !== digest) fail('transcript_hash inválido');
      if (tx.tx_id !== digest) fail('tx_id inválido');
      if (!verifyDigest({
        algorithm: tx.signature_algorithm, publicKey: tx.pq_public_key,
        messageDigest: digest, signature: tx.pq_signature, domainTag: 'SIG_TX_V1',
      }).valid) fail('assinatura inválida');
    }
  } catch {
    fail('envelope ou chave inválida');
  }
  const valid = failedChecks.length === 0;
  if (valid) seenRequestIds.add(tx.request_id);
  return {
    valid, failed_checks: failedChecks, status_code: valid ? 'OK' : 'FAILED_PRECONDITION',
    validation_scope: 'signature-and-structure-only', production_ready: false,
  };
}
