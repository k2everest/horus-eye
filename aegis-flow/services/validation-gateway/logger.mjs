import crypto from 'node:crypto';

const SERVICE_NAME = 'validation-gateway';

export function hashPayload(payload) {
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function buildLogEntry({ level, requestId, method, statusCode, latencyMs, txBlob, errorCode }) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: SERVICE_NAME,
    request_id: requestId,
    method,
    status_code: statusCode,
    latency_ms: latencyMs,
    tx_id_hash: txBlob ? hashPayload(txBlob) : undefined,
    error_code: errorCode,
  };

  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
}

export function writeLog(entry, sink = console.log) {
  sink(JSON.stringify(entry));
}
