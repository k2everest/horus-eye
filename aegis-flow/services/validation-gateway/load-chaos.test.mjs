import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { createValidationServer } from './server.mjs';

const SLO_AVAILABILITY = 0.999;
const RECOVERY_TARGET_MS = 2_000;

function validRequest(index) {
  return {
    tx_blob: `0123456789abcdef-load-${index}`,
    request_id: `load-${index}`,
    pq_signature: 'sig',
    pq_public_key: 'pk',
    kem_ciphertext: 'ct',
    signature_algorithm: 'ML-DSA-65',
    kem_algorithm: 'ML-KEM-768',
  };
}

async function startServer(options = {}) {
  const server = createValidationServer({ sink: () => {}, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function closeServer(server) {
  server.close();
  await once(server, 'close');
}

test('US-014: carga nominal atende SLO mínimo de disponibilidade', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => closeServer(server));

  const total = 200;
  const responses = await Promise.all(
    Array.from({ length: total }, (_, index) =>
      fetch(`${baseUrl}/validate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validRequest(index)),
      }).then(async (response) => {
        await response.arrayBuffer();
        return response;
      }),
    ),
  );
  const successful = responses.filter((response) => response.status === 200).length;
  const availability = successful / total;

  assert.ok(availability >= SLO_AVAILABILITY, `availability ${availability} below ${SLO_AVAILABILITY}`);
});

test('US-014: serviço recupera após falha injetada dentro do RTO', async (t) => {
  let failuresRemaining = 1;
  const { server, baseUrl } = await startServer({
    faultInjector: () => {
      if (failuresRemaining === 0) return false;
      failuresRemaining -= 1;
      return true;
    },
  });
  t.after(() => closeServer(server));

  const failed = await fetch(`${baseUrl}/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validRequest('chaos')),
  });
  await failed.arrayBuffer();
  assert.equal(failed.status, 503);

  const recoveryStartedAt = Date.now();
  const recovered = await fetch(`${baseUrl}/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validRequest('recovered')),
  });
  await recovered.arrayBuffer();
  const recoveryTimeMs = Date.now() - recoveryStartedAt;

  assert.equal(recovered.status, 200);
  assert.ok(recoveryTimeMs <= RECOVERY_TARGET_MS, `recovery took ${recoveryTimeMs}ms`);
});

test('carteira pública recebe preflight CORS para chamar o gateway', async (t) => {
  const { server, baseUrl } = await startServer();
  t.after(() => closeServer(server));

  const response = await fetch(`${baseUrl}/validate`, {
    method: 'OPTIONS',
    headers: { origin: 'http://localhost:8080' },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  assert.match(response.headers.get('access-control-allow-methods'), /POST/);
});
