import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { createValidationServer } from './server.mjs';
import { signedRequest } from './test-fixtures.mjs';

async function setup(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-ops-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const policyPath = join(directory, 'policy.json'); const tokens = { wallet: 'ab'.repeat(32), finalizer: 'cd'.repeat(32), monitor: 'ef'.repeat(32) };
  const policy = { schema: 'AEGIS_ACCESS_POLICY_V1', incident_mode: 'normal', principals: Object.entries(tokens).map(([id, token]) => ({ id,
    roles: id === 'wallet' ? ['reader', 'submitter'] : [id], token_sha256: crypto.createHash('sha256').update(token).digest('hex'), expires_at: Date.now() + 60_000 })) };
  const save = () => writeFileSync(policyPath, JSON.stringify(policy), { mode: 0o600 }); save(); const logs = [];
  const server = createValidationServer({ accessPolicyPath: policyPath, sink: line => logs.push(line), ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (path, id, body, extraHeaders = {}) => fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { ...extraHeaders, ...(id ? { authorization: `Bearer ${tokens[id]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { policy, save, logs, tokens, call, directory };
}

test('HTTP roles, immediate revocation, incident modes and protected metrics', async t => {
  const f = await setup(t);
  assert.equal((await f.call('/healthz')).status, 200);
  assert.equal((await f.call('/metrics')).status, 401);
  assert.equal((await f.call('/metrics', 'wallet')).status, 403);
  const transaction = signedRequest('ops-secret-free');
  assert.equal((await f.call('/validate', 'finalizer', transaction)).status, 403);
  assert.equal((await f.call('/validate', 'wallet', transaction)).status, 200);
  f.policy.incident_mode = 'read-only'; f.save();
  const denied = await f.call('/validate', 'wallet', transaction);
  assert.equal(denied.status, 503); assert.equal((await denied.json()).status_code, 'INCIDENT_RESTRICTION');
  const metrics = await f.call('/metrics', 'monitor'); assert.equal(metrics.status, 200);
  const text = await metrics.text(); assert.match(text, /aegis_http_requests_total\{route="validate",status="5xx"\}/);
  assert.match(text, /aegis_ready 0/);
  f.policy.incident_mode = 'halt'; f.save();
  assert.equal((await f.call('/ledger/root', 'wallet')).status, 503);
  f.policy.incident_mode = 'normal'; f.policy.principals = f.policy.principals.filter(p => p.id !== 'wallet'); f.save();
  assert.equal((await f.call('/validate', 'wallet', transaction)).status, 401);
  writeFileSync(join(f.directory, 'policy.json'), '{broken');
  assert.equal((await f.call('/metrics', 'monitor')).status, 503);
  assert.equal((await f.call('/healthz')).status, 200);
  const logs = f.logs.join('\n');
  for (const token of Object.values(f.tokens)) assert.ok(!logs.includes(token));
  assert.ok(!logs.includes(transaction.pq_signature)); assert.ok(!logs.includes(transaction.request_id));
  assert.ok(!text.includes('ops-secret-free'));
});

test('IP limits ignore spoofed forwarding headers and preserve bounded work', async t => {
  const f = await setup(t, { rateLimits: { perIp: 2 } });
  assert.equal((await f.call('/healthz')).status, 200); assert.equal((await f.call('/healthz')).status, 200);
  const limited = await f.call('/healthz', undefined, undefined, { 'x-forwarded-for': '203.0.113.5' }); assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '60');
});

test('remote startup refuses an unauthenticated plaintext listener', () => {
  const result = spawnSync(process.execPath, [new URL('./server.mjs', import.meta.url).pathname], {
    env: { ...process.env, NODE_ENV: 'test', AEGIS_BIND_HOST: '0.0.0.0', AEGIS_ACCESS_POLICY_PATH: '', AEGIS_TLS_KEY_FILE: '', AEGIS_TLS_CERT_FILE: '' }, encoding: 'utf8', timeout: 5000,
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /REMOTE_BIND_REQUIRES_ACCESS_POLICY_AND_TLS/); assert.doesNotMatch(result.stdout, /listening/);
});
