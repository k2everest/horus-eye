import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createValidationServer } from './server.mjs';

async function start(t, options = {}) {
  const server = createValidationServer({ sink: () => {}, maxInFlightBodies: 1, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const post = (base, body = '{}') => fetch(`${base}/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('reserves admission before body completion and releases it after an aborted upload', async t => {
  const { server, base } = await start(t);
  const observed = once(server, 'request');
  const held = http.request(`${base}/validate`, { method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' } });
  held.on('error', () => {});
  t.after(() => held.destroy());
  held.write('{"partial":"');
  const [incoming] = await observed;
  const overCapacity = await post(base);
  assert.equal(overCapacity.status, 429);
  assert.equal(overCapacity.headers.get('retry-after'), '1');
  assert.equal((await overCapacity.json()).status_code, 'REQUEST_CAPACITY_EXCEEDED');
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const aborted = once(incoming, 'aborted');
  held.destroy();
  await aborted;
  const recovered = await post(base);
  assert.equal(recovered.status, 400); // schema invalid, but body admission is available again
  await recovered.arrayBuffer();
});

test('malformed and oversized requests release their admission slots', async t => {
  const { base } = await start(t, { maxBodyBytes: 16 });
  for (const [body, expected] of [['{', 400], ['x'.repeat(17), 413], ['{}', 400], ['{}', 400]]) {
    const response = await post(base, body);
    assert.equal(response.status, expected);
    await response.arrayBuffer();
  }
});

test('rejects invalid admission configuration', () => {
  for (const maxInFlightBodies of [0, -1, 1.5, NaN, 65]) {
    assert.throws(() => createValidationServer({ maxInFlightBodies }), /admission limit/);
  }
});
