import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { createWalletServer } from './server.mjs';

test('loopback service requires pinned Origin, Host and capability; idle session locks', async t => {
  let unlocks = 0;
  const wallet = { locked: true, busy: false, status() { return { locked: this.locked }; },
    async unlock(passphrase) { assert.equal(passphrase, 'never logged passphrase'); this.locked = false; unlocks++; return this.status(); },
    lock() { this.locked = true; return this.status(); }, close() { this.lock(); } };
  const token = 'ab'.repeat(32);
  const server = createWalletServer({ wallet, token, idleMs: 1000 });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { authorization: `Bearer ${token}`, origin: 'http://localhost:8080', 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/status`)).status, 401);
  assert.equal((await fetch(`${base}/status`, { headers: { ...headers, origin: 'https://attacker.invalid' } })).status, 403);
  const wrongHost = await new Promise((resolve, reject) => {
    const request = http.get(`${base}/status`, { headers: { ...headers, host: 'attacker.invalid' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject);
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(`${base}/status`, { headers: { ...headers, authorization: `Bearer ${'ÿ'.repeat(64)}` } })).status, 401);
  assert.equal(unlocks, 0);
  assert.equal((await fetch(`${base}/unlock`, { method: 'POST', headers, body: JSON.stringify({ passphrase: 'never logged passphrase' }) })).status, 200);
  assert.equal(wallet.locked, false);
  await setTimeout(2100);
  assert.equal(wallet.locked, true);
  assert.equal(unlocks, 1);
});

test('shutdown keeps profile ownership until an in-flight operation finishes', async () => {
  let disposed = false; let closed = false;
  const wallet = { busy: true, locked: true, close() { closed = true; }, status: () => ({ locked: true }) };
  const server = createWalletServer({ wallet, token: 'ab'.repeat(32), onDisposed: () => { disposed = true; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  await new Promise(resolve => server.close(resolve));
  assert.equal(closed, false); assert.equal(disposed, false);
  wallet.busy = false;
  await setTimeout(200);
  assert.equal(closed, true); assert.equal(disposed, true);
});
