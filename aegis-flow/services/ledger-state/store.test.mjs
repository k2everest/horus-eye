import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { PersistentLedger } from './store.mjs';
import { verifyInclusionProof } from '../../libs/crypto-core/merkle-proof.mjs';

const run = promisify(execFile);
const hex = number => number.toString(16).padStart(64, '0');
function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-ledger-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { filename: join(directory, 'ledger.sqlite'), directory };
}
function transition(ledger, overrides = {}) {
  return { transactionId: hex(10), requestId: 'req-10', expectedRoot: ledger.latest().root,
    inputCommitments: [hex(1)], newCommitments: [hex(2)], nullifiers: [hex(100)], ...overrides };
}

test('durable atomic transition, historical roots, inclusion and idempotence survive reopen', t => {
  const { filename } = setup(t);
  let ledger = new PersistentLedger({ filename });
  const genesis = ledger.bootstrap({ commitments: [hex(1)] });
  const input = transition(ledger);
  const receipt = ledger.commitTransition(input);
  assert.equal(receipt.height, 1);
  assert.equal(receipt.settled, false);
  assert.equal(ledger.hasNullifier(hex(100)), true);
  const included = ledger.inclusionProof({ commitment: hex(2) });
  assert.equal(verifyInclusionProof({ proof: included.proof, trustedRoot: receipt.root }), true);
  assert.deepEqual(ledger.snapshot(0).commitments, [hex(1)]);
  assert.equal(ledger.snapshot(0).root, genesis.root);
  ledger.close();
  ledger = new PersistentLedger({ filename });
  try {
    assert.equal(ledger.latest().root, receipt.root);
    assert.equal(ledger.hasNullifier(hex(100)), true);
    assert.deepEqual(ledger.receipt(input.requestId), receipt);
    assert.equal(ledger.commitTransition(input).replayed, true);
    assert.equal(ledger.latest().height, 1);
    assert.throws(() => ledger.commitTransition({ ...input, newCommitments: [hex(3)] }), /REQUEST_ID_CONFLICT/);
    assert.throws(() => ledger.bootstrap({ commitments: [hex(4)] }), /GENESIS_ALREADY_INITIALIZED/);
  } finally { ledger.close(); }
});

test('rejects stale roots, unknown/spent inputs, duplicate nullifiers and malformed batches without partial writes', t => {
  const { filename } = setup(t);
  const ledger = new PersistentLedger({ filename });
  t.after(() => ledger.close());
  ledger.bootstrap({ commitments: [hex(1), hex(3)] });
  const input = transition(ledger);
  for (const overrides of [
    { expectedRoot: hex(999) }, { inputCommitments: [hex(999)] },
    { nullifiers: [hex(100), hex(100)] }, { newCommitments: [hex(1)] },
    { inputCommitments: [hex(1), hex(1)] }, { newCommitments: [] },
  ]) {
    assert.throws(() => ledger.commitTransition({ ...input, ...overrides }));
    assert.equal(ledger.latest().height, 0);
    assert.equal(ledger.hasNullifier(hex(100)), false);
    assert.equal(ledger.receipt(input.requestId), undefined);
  }
  ledger.commitTransition(input);
  assert.throws(() => ledger.commitTransition(transition(ledger, { transactionId: hex(11), requestId: 'other', nullifiers: [hex(101)] })), /INPUT_ALREADY_SPENT/);
  assert.throws(() => ledger.commitTransition(transition(ledger, { transactionId: hex(11), requestId: 'other', inputCommitments: [hex(3)], newCommitments: [hex(4)] })), /NULLIFIER_ALREADY_USED/);
  assert.equal(ledger.latest().height, 1);
});

test('exception after outputs rolls back root, receipt, commitments and nullifiers together', t => {
  const { filename } = setup(t);
  const ledger = new PersistentLedger({ filename, faultInjector: stage => { if (stage === 'after_outputs') throw new Error('injected'); } });
  t.after(() => ledger.close());
  const initial = ledger.bootstrap({ commitments: [hex(1)] });
  assert.throws(() => ledger.commitTransition(transition(ledger)), /injected/);
  assert.deepEqual(ledger.latest(), initial);
  assert.equal(ledger.hasNullifier(hex(100)), false);
  assert.equal(ledger.receipt('req-10'), undefined);
  assert.throws(() => ledger.inclusionProof({ commitment: hex(2) }), /UNKNOWN_COMMITMENT/);
});

test('two independent processes cannot consume the same input concurrently', async t => {
  const { filename } = setup(t);
  const ledger = new PersistentLedger({ filename });
  ledger.bootstrap({ commitments: [hex(1)] });
  const initial = transition(ledger);
  ledger.close();
  const moduleUrl = new URL('./store.mjs', import.meta.url).href;
  const code = `import {PersistentLedger} from ${JSON.stringify(moduleUrl)};
    const ledger=new PersistentLedger({filename:process.argv[1]});
    try { ledger.commitTransition(JSON.parse(process.argv[2])); console.log('COMMITTED'); }
    catch(error) { console.log(error.code || error.message); }
    finally { ledger.close(); }`;
  const results = await Promise.all([0, 1].map(i => run(process.execPath, ['--input-type=module', '-e', code, filename,
    JSON.stringify({ ...initial, requestId: `race-${i}`, transactionId: hex(20 + i), newCommitments: [hex(30 + i)] })])));
  assert.equal(results.filter(result => result.stdout.trim() === 'COMMITTED').length, 1);
  assert.ok(results.some(result => /STALE_ROOT|INPUT_ALREADY_SPENT/.test(result.stdout)));
  const reopened = new PersistentLedger({ filename });
  try { assert.equal(reopened.latest().height, 1); assert.equal(reopened.snapshot().commitments.length, 2); }
  finally { reopened.close(); }
});

test('process crash before commit leaves no partial state after recovery', async t => {
  const { filename } = setup(t);
  const ledger = new PersistentLedger({ filename });
  const initial = ledger.bootstrap({ commitments: [hex(1)] });
  const input = transition(ledger);
  ledger.close();
  const moduleUrl = new URL('./store.mjs', import.meta.url).href;
  const code = `import {PersistentLedger} from ${JSON.stringify(moduleUrl)};
    const ledger=new PersistentLedger({filename:process.argv[1],faultInjector:()=>process.kill(process.pid,'SIGKILL')});
    ledger.commitTransition(JSON.parse(process.argv[2]));`;
  await assert.rejects(run(process.execPath, ['--input-type=module', '-e', code, filename, JSON.stringify(input)]), error => error.signal === 'SIGKILL');
  const recovered = new PersistentLedger({ filename });
  try {
    assert.deepEqual(recovered.latest(), initial);
    assert.equal(recovered.hasNullifier(hex(100)), false);
    assert.equal(recovered.receipt(input.requestId), undefined);
    assert.equal(recovered.commitTransition(input).height, 1);
  } finally { recovered.close(); }
});

test('consistent SQLite backup restores and refuses network/schema/root mismatch', async t => {
  const { filename, directory } = setup(t);
  const ledger = new PersistentLedger({ filename });
  ledger.bootstrap({ commitments: [hex(1)] });
  ledger.commitTransition(transition(ledger));
  const destination = join(directory, 'backup.sqlite');
  await ledger.backupTo(destination);
  const restored = new PersistentLedger({ filename: destination });
  try { assert.deepEqual(restored.snapshot(), ledger.snapshot()); assert.equal(restored.hasNullifier(hex(100)), true); }
  finally { restored.close(); ledger.close(); }
  assert.throws(() => new PersistentLedger({ filename, networkId: 'another-network' }), /NETWORK_MISMATCH/);
  const raw = new DatabaseSync(filename);
  raw.exec('PRAGMA user_version=99');
  raw.close();
  assert.throws(() => new PersistentLedger({ filename }), /UNSUPPORTED_LEDGER_SCHEMA/);
  const modified = new DatabaseSync(filename);
  modified.exec('PRAGMA user_version=3');
  modified.prepare('UPDATE blocks SET root=? WHERE height=1').run(hex(999));
  modified.close();
  assert.throws(() => new PersistentLedger({ filename }), /LEDGER_ROOT_MISMATCH/);
});
