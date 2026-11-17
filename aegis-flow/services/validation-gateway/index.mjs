import crypto from 'node:crypto';
import { buildLogEntry, writeLog } from './logger.mjs';
import { assertDemoRuntime } from './runtime-policy.mjs';

const METHOD = 'ValidateShieldedTx';
const ALLOWED_SIG = new Set(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']);
const ALLOWED_KEM = new Set(['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

function validateAntiQuantumEnvelope(request) {
  const failed = [];

  if (!isText(request?.pq_signature)) {
    failed.push('FAILED_PRECONDITION: pq_signature ausente');
  }
  if (!isText(request?.pq_public_key)) {
    failed.push('FAILED_PRECONDITION: pq_public_key ausente');
  }
  if (!isText(request?.kem_ciphertext)) {
    failed.push('FAILED_PRECONDITION: kem_ciphertext ausente');
  }
  if (!ALLOWED_SIG.has(request?.signature_algorithm)) {
    failed.push('FAILED_PRECONDITION: signature_algorithm deve ser ML-DSA-*');
  }
  if (!ALLOWED_KEM.has(request?.kem_algorithm)) {
    failed.push('FAILED_PRECONDITION: kem_algorithm deve ser ML-KEM-*');
  }

  return failed;
}

export function validateShieldedTx(request, sink = console.log) {
  assertDemoRuntime();
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return { valid: false, status_code: 'INVALID_ARGUMENT', failed_checks: ['INVALID_ARGUMENT: objeto JSON obrigatório'] };
  }
  const start = Date.now();
  const requestId = isText(request.request_id) && request.request_id.length <= 128 ? request.request_id : crypto.randomUUID();
  const txBlob = typeof request.tx_blob === 'string' ? request.tx_blob : '';

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
    validation_scope: 'demo-envelope-only',
    production_ready: false,
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
