import crypto from 'node:crypto';
import { buildLogEntry, writeLog } from './logger.mjs';
import { assertDemoRuntime } from './runtime-policy.mjs';
import { assertPqcRuntime } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { validateShieldedTxV1 } from '../../libs/crypto-core/validate-shielded-tx.mjs';

export function validateShieldedTx(request, sink = console.log) {
  assertDemoRuntime();
  assertPqcRuntime();
  const start = Date.now();
  const requestId = typeof request?.request_id === 'string' && request.request_id.length <= 128
    ? request.request_id : crypto.randomUUID();
  // Only a hash of public input is retained in logs, never keys/notes/envelopes.
  const txBlob = JSON.stringify(request ?? null);
  writeLog(buildLogEntry({
    level: 'info', requestId, method: 'ValidateShieldedTx', statusCode: 'IN_PROGRESS', latencyMs: 0, txBlob,
  }), sink);
  const result = validateShieldedTxV1({ tx: request });
  const response = {
    ...result, request_id: requestId,
    validation_scope: 'signature-and-structure-only', production_ready: false,
  };
  writeLog(buildLogEntry({
    level: response.valid ? 'info' : 'warn', requestId, method: 'ValidateShieldedTx',
    statusCode: response.status_code, latencyMs: Date.now() - start, txBlob,
    errorCode: response.valid ? undefined : 'TX_VALIDATION_FAILED',
  }), sink);
  return response;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  // The CLI cannot synthesize a valid transaction using demo strings.
  const request = JSON.parse(process.argv[2] || '{}');
  console.log(JSON.stringify({ type: 'response', ...validateShieldedTx(request) }));
}
