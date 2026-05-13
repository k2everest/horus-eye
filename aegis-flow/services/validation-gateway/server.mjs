import http from 'node:http';

import { validateShieldedTx } from './index.mjs';

const port = Number(process.env.PORT || 8080);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
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
      try {
        const parsed = body ? JSON.parse(body) : {};
        const response = validateShieldedTx(
          {
            tx_blob: parsed.tx_blob,
            request_id: parsed.request_id,
          },
          console.log,
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

server.listen(port, () => {
  console.log(JSON.stringify({ level: 'info', service: 'validation-gateway', message: `listening on :${port}` }));
});
