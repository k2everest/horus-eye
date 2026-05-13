import crypto from 'node:crypto';
import { buildLogEntry, writeLog } from './logger.mjs';

const METHOD = 'ValidateShieldedTx';

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

  let response;

  if (!txBlob || txBlob.length < 16) {
    response = {
      valid: false,
      failed_checks: ['INVALID_ARGUMENT: tx_blob ausente ou muito curto'],
      request_id: requestId,
      status_code: 'INVALID_ARGUMENT',
    };
  } else {
    response = {
      valid: true,
      failed_checks: [],
      request_id: requestId,
      status_code: 'OK',
    };
  }

  writeLog(
    buildLogEntry({
      level: response.valid ? 'info' : 'warn',
      requestId,
      method: METHOD,
      statusCode: response.status_code,
      latencyMs: Date.now() - start,
      txBlob,
      errorCode: response.valid ? undefined : 'TX_VALIDATION_FAILED',
    }),
    sink,
  );

  return response;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const request = {
    tx_blob: process.argv[2] ?? 'sample-shielded-transaction-payload',
    request_id: process.argv[3] ?? 'demo-request-id',
  };

  const response = validateShieldedTx(request);
  console.log(JSON.stringify({ type: 'response', ...response }));
}
