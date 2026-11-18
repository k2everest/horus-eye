import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createValidationServer } from './server.mjs';
import { signedRequest } from './test-fixtures.mjs';
import { PersistentLedger } from '../ledger-state/store.mjs';

async function start(ledgerPath) {
  const server = createValidationServer({ ledgerPath, sink: () => {}, starkBackend: null });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
const post = (base, path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('HTTP verification receipt survives restart without minting commitments or reporting settlement', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-http-state-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, 'ledger.sqlite');
  let { server, base } = await start(filename);
  let active = server;
  t.after(() => close(active));
  const tx = signedRequest('persistent-request');
  const response = await post(base, '/validate', tx);
  assert.equal(response.status, 200);
  const accepted = await response.json();
  assert.equal(accepted.receipt.status, 'SIGNATURE_VERIFIED');
  assert.equal(accepted.receipt.settled, false);
  assert.equal(accepted.receipt.proof_status, 'NOT_REQUESTED');
  assert.ok(!JSON.stringify(accepted.receipt).includes(tx.pq_signature));
  await close(server);
  ({ server, base } = await start(filename));
  active = server;
  const persisted = await fetch(`${base}/receipts/${tx.request_id}`);
  assert.equal(persisted.status, 200);
  assert.deepEqual(await persisted.json(), accepted.receipt);
  const retry = await post(base, '/validate', tx);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).receipt.replayed, true);
  const conflicting = await post(base, '/validate', signedRequest(tx.request_id));
  assert.equal(conflicting.status, 409);
  assert.equal((await conflicting.json()).status_code, 'REQUEST_ID_CONFLICT');
  const forged = await post(base, '/validate', { ...signedRequest('forged-request'), pq_signature: '00' });
  assert.equal(forged.status, 400);
  await forged.arrayBuffer();
  assert.equal((await fetch(`${base}/receipts/forged-request`)).status, 404);
  const submit = await post(base, '/submit', { ...tx, proof: { ownership: true, balance: true, range: true } });
  assert.equal(submit.status, 503);
  assert.equal((await submit.json()).status_code, 'ZK_BACKEND_NOT_CONFIGURED');
  const ledger = new PersistentLedger({ filename });
  try {
    assert.equal(ledger.latest().height, 0);
    assert.deepEqual(ledger.snapshot().commitments, []);
    assert.equal(ledger.receipt(tx.request_id), undefined);
  } finally { ledger.close(); }
});

test('without persistence the receipt endpoint fails explicitly', async t => {
  const { server, base } = await start();
  t.after(() => close(server));
  const response = await fetch(`${base}/receipts/test`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).status_code, 'STATE_NOT_CONFIGURED');
});
