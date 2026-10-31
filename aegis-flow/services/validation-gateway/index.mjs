import crypto from 'node:crypto';
import { buildLogEntry, writeLog } from './logger.mjs';

const METHOD = 'ValidateShieldedTx';
const ALLOWED_SIG = /^ML-DSA-/;
const ALLOWED_KEM = /^ML-KEM-/;

function validateAntiQuantumEnvelope(request) {
  const failed = [];

  if (!request?.pq_signature) {
    failed.push('FAILED_PRECONDITION: pq_signature ausente');
  }
  if (!request?.pq_public_key) {
    failed.push('FAILED_PRECONDITION: pq_public_key ausente');
  }
  if (!request?.kem_ciphertext) {
    failed.push('FAILED_PRECONDITION: kem_ciphertext ausente');
  }
  if (!request?.signature_algorithm || !ALLOWED_SIG.test(request.signature_algorithm)) {
    failed.push('FAILED_PRECONDITION: signature_algorithm deve ser ML-DSA-*');
  }
  if (!request?.kem_algorithm || !ALLOWED_KEM.test(request.kem_algorithm)) {
    failed.push('FAILED_PRECONDITION: kem_algorithm deve ser ML-KEM-*');
  }

  return failed;
}

export function validateShieldedTx(request, sink = console.log) {
  const start = Date.now();
  const requestId = request?.request_id || crypto.randomUUID();
  const txBlob = request?.tx_blob ?? '';

  writeLog(
    buildLogEntry({
      level: 'info',
      requestId,
      method: METHOD,
      statusCode: 'IN_PROGRESS',
      latencyMs: 0,
      txBlob,
    }),
    sink,
  );

  const failedChecks = [];

  if (!txBlob || txBlob.length < 16) {
    failedChecks.push('INVALID_ARGUMENT: tx_blob ausente ou muito curto');
  }

  failedChecks.push(...validateAntiQuantumEnvelope(request));

  const valid = failedChecks.length === 0;
  const response = {
    valid,
    failed_checks: failedChecks,
    request_id: requestId,
    status_code: valid ? 'OK' : 'FAILED_PRECONDITION',
  };

  writeLog(
    buildLogEntry({
      level: valid ? 'info' : 'warn',
      requestId,
      method: METHOD,
      statusCode: response.status_code,
      latencyMs: Date.now() - start,
      txBlob,
      errorCode: valid ? undefined : 'TX_VALIDATION_FAILED',
    }),
    sink,
  );

  return response;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const request = {
    tx_blob: process.argv[2] ?? 'sample-shielded-transaction-payload',
    request_id: process.argv[3] ?? 'demo-request-id',
    pq_signature: 'demo-signature',
    pq_public_key: 'demo-public-key',
    kem_ciphertext: 'demo-kem-ciphertext',
    signature_algorithm: 'ML-DSA-65',
    kem_algorithm: 'ML-KEM-768',
  };

  const response = validateShieldedTx(request);
  console.log(JSON.stringify({ type: 'response', ...response }));
}
