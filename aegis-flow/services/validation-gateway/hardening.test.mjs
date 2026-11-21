import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createValidationServer } from './server.mjs';
import { validateShieldedTx } from './index.mjs';
import { assertDemoRuntime } from './runtime-policy.mjs';
import { signedRequest } from './test-fixtures.mjs';

const envelope = signedRequest('hardening-test');

test('demo runtime fails closed for production and unknown modes', () => {
  assert.doesNotThrow(() => assertDemoRuntime({ NODE_ENV: 'test' }));
  for (const env of [
    { NODE_ENV: 'production' }, { NODE_ENV: 'production', AEGIS_MODE: 'demo' },
    { AEGIS_MODE: 'production' }, { AEGIS_MODE: 'prod' }, { AEGIS_MODE: '' },
  ]) assert.throws(() => assertDemoRuntime(env), /AEGIS_PRODUCTION_BLOCKED/);
});

test('actual startup and direct validation are blocked in production', () => {
  for (const entry of ['server.mjs', 'index.mjs']) {
    const result = spawnSync(process.execPath, [new URL(entry, import.meta.url).pathname], {
      env: { ...process.env, NODE_ENV: 'production', AEGIS_MODE: 'demo' },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /AEGIS_PRODUCTION_BLOCKED/);
    assert.doesNotMatch(result.stdout, /listening|"valid":true/);
  }
});

test('validation rejects non-string crypto fields and invented algorithm names', () => {
  const logs = [];
  for (const field of ['pq_signature', 'pq_public_key', 'kem_ciphertext', 'tx_blob']) {
    for (const value of [true, 123, {}, [], ' ']) {
      assert.equal(validateShieldedTx({ ...envelope, [field]: value }, line => logs.push(line)).valid, false);
    }
  }
  assert.equal(validateShieldedTx({ ...envelope, signature_algorithm: 'ML-DSA-forged' }, () => {}).valid, false);
  assert.equal(validateShieldedTx({ ...envelope, kem_algorithm: 'ML-KEM-forged' }, () => {}).valid, false);
  for (const value of [null, [], true, 'text']) {
    assert.equal(validateShieldedTx(value, () => {}).valid, false);
  }
  const response = validateShieldedTx(envelope, () => {});
  assert.equal(response.valid, true);
  assert.equal(response.production_ready, false);
  assert.equal(response.validation_scope, 'signature-and-structure-only');
  assert.ok(logs.every(line => !line.includes('pq_signature')));
});

test('HTTP rejects oversized, malformed and non-JSON requests; remains usable', async t => {
  const logs = [];
  const server = createValidationServer({ sink: line => logs.push(line), maxBodyBytes: 32768 });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, type = 'application/json') => fetch(`${url}/validate`, {
    method: 'POST', headers: { 'content-type': type }, body,
  });
  for (const body of ['null', '[]', 'true', '"hello"', '{broken']) {
    const response = await post(body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).valid, false);
  }
  const unsupported = await post('secret', 'text/plain');
  assert.equal(unsupported.status, 415);
  await unsupported.arrayBuffer();
  const tooLarge = await post(JSON.stringify({ tx_blob: 'sensitive'.repeat(5000) }));
  assert.equal(tooLarge.status, 413);
  await tooLarge.arrayBuffer();
  const chunked = await fetch(`${url}/validate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, duplex: 'half',
    body: (async function* () {
      yield Buffer.from('{"tx_blob":"');
      yield Buffer.from('é'.repeat(17000));
      yield Buffer.from('"}');
    })(),
  });
  assert.equal(chunked.status, 413);
  await chunked.arrayBuffer();
  const accepted = await post(JSON.stringify(envelope), 'application/json; charset=utf-8');
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).production_ready, false);
  const tampered = await post(JSON.stringify({ ...envelope, amount: envelope.amount + 1 }));
  assert.equal(tampered.status, 400);
  assert.equal((await tampered.json()).valid, false);
  const health = await (await fetch(`${url}/healthz`)).json();
  assert.equal(health.production_ready, false);
  assert.equal(health.mode, 'demo');
  assert.ok(logs.every(line => !line.includes('sensitive')));
});
