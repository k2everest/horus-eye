import http from 'node:http';
import { fileURLToPath } from 'node:url';

import { validateShieldedTx } from './index.mjs';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': process.env.CORS_ORIGIN || 'http://localhost:8080',
    'access-control-allow-headers': 'content-type,x-request-id',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

export function createValidationServer({ sink = console.log, faultInjector = () => false } = {}) {
  return http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/healthz') {
      sendJson(res, 200, { status: 'ok', service: 'validation-gateway' });
      return;
    }

    if (req.method === 'POST' && req.url === '/validate') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });

      req.on('end', () => {
        if (faultInjector({ method: req.method, url: req.url })) {
          sendJson(res, 503, { status_code: 'UNAVAILABLE', retryable: true });
          return;
        }

        try {
          const parsed = body ? JSON.parse(body) : {};
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
