import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { validateShieldedTx } from './index.mjs';
import { assertDemoRuntime } from './runtime-policy.mjs';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:8080',
    'access-control-allow-headers': 'content-type,x-request-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

export function createValidationServer({ sink = console.log, faultInjector = () => false, maxBodyBytes = 65536 } = {}) {
  assertDemoRuntime();
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1048576) {
    throw new RangeError('maxBodyBytes must be between 1 and 1048576');
  }
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { status: 'ok', service: 'validation-gateway', mode: 'demo', production_ready: false });
      return;
    }

    if (req.method === 'POST' && req.url === '/validate') {
      if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
        req.resume();
        sendJson(res, 415, { valid: false, status_code: 'UNSUPPORTED_MEDIA_TYPE' });
        return;
      }
      let body = '';
      let bytes = 0;
      let oversized = false;
      const chunks = [];
      req.on('data', (chunk) => {
        if (oversized) return;
        bytes += chunk.length;
        if (bytes > maxBodyBytes) {
          oversized = true;
          chunks.length = 0;
          sendJson(res, 413, { valid: false, status_code: 'PAYLOAD_TOO_LARGE' });
          return;
        }
        chunks.push(chunk);
      });
      req.on('error', () => { if (!res.writableEnded) res.destroy(); });

      req.on('end', () => {
        if (oversized) return;
        body = Buffer.concat(chunks).toString('utf8');
        if (faultInjector({ method: req.method, url: req.url })) {
          sendJson(res, 503, { status_code: 'UNAVAILABLE', retryable: true });
          return;
        }

        try {
          const parsed = body ? JSON.parse(body) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid object');
          const response = validateShieldedTx(
            {
              tx_blob: parsed.tx_blob,
              request_id: parsed.request_id,
              pq_signature: parsed.pq_signature,
              pq_public_key: parsed.pq_public_key,
              kem_ciphertext: parsed.kem_ciphertext,
              signature_algorithm: parsed.signature_algorithm,
              kem_algorithm: parsed.kem_algorithm,
            },
            sink,
          );

          sendJson(res, response.valid ? 200 : 400, response);
        } catch {
          sendJson(res, 400, {
            valid: false,
            failed_checks: ['INVALID_ARGUMENT: corpo JSON inválido'],
            request_id: undefined,
            status_code: 'INVALID_ARGUMENT',
          });
        }
      });
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 15_000;
  return server;
}

export function startValidationServer({ port = Number(process.env.PORT || 8080), sink = console.log, ...options } = {}) {
  const server = createValidationServer({ sink, ...options });
  server.listen(port, () => {
    sink(JSON.stringify({ level: 'info', service: 'validation-gateway', message: `listening on :${port}` }));
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startValidationServer();
}
