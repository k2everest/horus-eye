import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { StarkBackend } from './backend.mjs';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { submitProvenTransfer } from '../ledger-state/submit-transfer.mjs';
import { createValidationServer } from '../validation-gateway/server.mjs';
import { createSpendIdentity, createPrivateNote, noteCommitmentV2 } from '../../libs/crypto-core/shielded-note-v2.mjs';
import { generateSigningKeyPair, generateKemKeyPair } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { prepareTransferV2 } from '../../libs/crypto-core/transfer-v2.mjs';
import { proveTxV1 } from '../../libs/crypto-core/prover-v1.mjs';
import { verifyTxProofV1 } from '../../libs/crypto-core/verifier-v1.mjs';
import { starkStatementDigest } from '../../libs/crypto-core/stark-statement.mjs';
import { verifyInclusionProof } from '../../libs/crypto-core/merkle-proof.mjs';

const enabled = process.env.AEGIS_STARK_INTEGRATION === '1';
const run = promisify(execFile);

test('real composite STARK: private witness, adversarial verification and durable atomic HTTP application', { skip: !enabled, timeout: 660_000 }, async t => {
  const backend = new StarkBackend();
  assert.equal(backend.availableForProving(), true, 'run python3 aegis-flow/scripts/setup-stark.py first');
  const directory = mkdtempSync(join(tmpdir(), 'aegis-stark-integration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const owner = createSpendIdentity();
  const recipient = createSpendIdentity();
  const note = createPrivateNote({ ownerTag: owner.owner_tag, value: 7 });
  const output = createPrivateNote({ ownerTag: recipient.owner_tag, value: 6 });
  const commitment = noteCommitmentV2(note);
  const filename = join(directory, 'ledger.sqlite');
  const ledger = new PersistentLedger({ filename });
  t.after(() => ledger.close());
  const genesis = ledger.bootstrap({ commitments: [commitment] });
  const signer = generateSigningKeyPair();
  const kem = generateKemKeyPair();
  const prepared = prepareTransferV2({
    requestId: 'stark-integration', anchorStateRoot: genesis.root, fee: 1,
    privateKey: signer.privateKey,
    inputs: [{ note, spend_secret: owner.spend_secret, membership: ledger.inclusionProof({ commitment }).proof }],
    outputs: [{ note: output, recipientPublicKey: kem.publicKey }],
  });
  // Proving is intentionally real, slow and never a dev-mode/mock receipt.
  const proved = await proveTxV1({ ...prepared, backend });
  assert.equal(proved.ok, true, proved.error);
  const proof = proved.proof;
  assert.ok(proved.proof_size_bytes > 1000);
  assert.ok(!JSON.stringify(proof).includes(owner.spend_secret));
  assert.ok(!JSON.stringify(proof).includes(note.randomness));
  assert.equal((await verifyTxProofV1({ statement: prepared.statement, proof, backend })).valid, true);

  await t.test('journal binding, fixed image ID, binary tampering and legacy forgery are checked', async () => {
    const changedStatement = { ...prepared.statement, public_amount: 2 };
    assert.equal((await backend.verify({ statement: changedStatement, proof: { ...proof, statement_digest: starkStatementDigest(changedStatement) } })).valid, false);
    assert.equal((await backend.verify({ statement: prepared.statement, proof: { ...proof, program_id: '0'.repeat(64) } })).valid, false);
    const bytes = Buffer.from(proof.receipt, 'base64');
    bytes[Math.floor(bytes.length / 2)] ^= 1;
    assert.equal((await backend.verify({ statement: prepared.statement, proof: { ...proof, receipt: bytes.toString('base64') } })).valid, false);
    assert.equal((await backend.verify({ statement: prepared.statement, proof: { scheme: 'LATTICE-ZK-MVP', ownership: true, balance: true, range: true } })).valid, false);
  });

  await t.test('guest refuses wrong ownership and inflation rather than proving public flags', async () => {
    const wrongOwner = structuredClone(prepared.witness);
    wrongOwner.inputs[0].spend_secret = '0'.repeat(64);
    assert.equal((await proveTxV1({ statement: prepared.statement, witness: wrongOwner, backend })).ok, false);
    const inflatedWitness = structuredClone(prepared.witness);
    inflatedWitness.outputs[0].value = 70;
    const inflatedStatement = { ...prepared.statement, output_commitments: [noteCommitmentV2(inflatedWitness.outputs[0])] };
    assert.equal((await proveTxV1({ statement: inflatedStatement, witness: inflatedWitness, backend })).ok, false);
    const outsideRange = structuredClone(prepared.witness);
    outsideRange.outputs[0].value = 9_007_199_254_740_992;
    assert.equal((await proveTxV1({ statement: prepared.statement, witness: outsideRange, backend })).ok, false);
    const invalidPath = structuredClone(prepared.witness);
    invalidPath.inputs[0].membership.index = 1;
    assert.equal((await proveTxV1({ statement: prepared.statement, witness: invalidPath, backend })).ok, false);
    assert.equal((await proveTxV1({ statement: { ...prepared.statement, nullifiers: ['0'.repeat(64)] }, witness: prepared.witness, backend })).ok, false);
  });

  await t.test('caller mutations during native verification cannot change the committed transaction', async () => {
    const path = join(directory, 'snapshot.sqlite');
    const snapshotLedger = new PersistentLedger({ filename: path });
    snapshotLedger.bootstrap({ commitments: [commitment] });
    let entered; let release;
    const ready = new Promise(resolve => { entered = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const delayed = {
      programId: backend.programId, availableForVerification: () => backend.availableForVerification(),
      verify: async args => { const result = await backend.verify(args); entered(); await gate; return result; },
    };
    const mutableTransaction = structuredClone(prepared.transaction);
    const mutableProof = structuredClone(proof);
    try {
      const pending = submitProvenTransfer({ ledger: snapshotLedger, transaction: mutableTransaction, proof: mutableProof, backend: delayed });
      await ready;
      mutableTransaction.public_amount = 123;
      mutableProof.receipt = 'invalid';
      release();
      assert.equal((await pending).valid, true);
      assert.equal(snapshotLedger.publicTransaction(prepared.transaction.tx_id).transaction.public_amount, 1);
    } finally { release?.(); snapshotLedger.close(); }
  });

  await t.test('two processes verifying the same valid proof apply once and retry idempotently', async () => {
    const raceFile = join(directory, 'race.sqlite');
    const race = new PersistentLedger({ filename: raceFile });
    race.bootstrap({ commitments: [commitment] }); race.close();
    const publicFile = join(directory, 'public.json');
    writeFileSync(publicFile, JSON.stringify({ transaction: prepared.transaction, proof }), { mode: 0o600 });
    const storeUrl = new URL('../ledger-state/store.mjs', import.meta.url).href;
    const submitUrl = new URL('../ledger-state/submit-transfer.mjs', import.meta.url).href;
    const code = `import fs from 'node:fs';import {PersistentLedger} from ${JSON.stringify(storeUrl)};
      import {submitProvenTransfer} from ${JSON.stringify(submitUrl)};
      const ledger=new PersistentLedger({filename:process.argv[1]});
      try {console.log(JSON.stringify(await submitProvenTransfer({ledger,...JSON.parse(fs.readFileSync(process.argv[2]))})));}
      finally {ledger.close();}`;
    const results = await Promise.all([0, 1].map(() => run(process.execPath, ['--input-type=module', '-e', code, raceFile, publicFile], { timeout: 30_000 })));
    const receipts = results.map(result => JSON.parse(result.stdout));
    assert.ok(receipts.every(result => result.valid));
    assert.equal(receipts.filter(result => result.receipt.replayed).length, 1);
    const reopened = new PersistentLedger({ filename: raceFile });
    try { assert.equal(reopened.latest().height, 1); assert.equal(reopened.hasNullifier(prepared.transaction.nullifiers[0]), true); }
    finally { reopened.close(); }
  });

  let server;
  const start = async () => {
    server = createValidationServer({ ledgerPath: filename, starkBackend: backend, sink: () => {} });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${server.address().port}`;
  };
  const stop = () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  t.after(async () => { if (server?.listening) await stop(); });
  let base = await start();
  const submit = async body => fetch(`${base}/submit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const response = await submit({ transaction: prepared.transaction, proof });
  assert.equal(response.status, 200);
  const applied = await response.json();
  assert.equal(applied.status_code, 'APPLIED_LOCAL');
  assert.equal(applied.receipt.height, 1);
  assert.equal(applied.receipt.proof_audit.program_id, backend.programId);
  assert.equal(applied.production_ready, false);
  assert.equal(ledger.hasNullifier(prepared.transaction.nullifiers[0]), true);
  const included = await (await fetch(`${base}/ledger/proof/${prepared.transaction.output_commitments[0]}`)).json();
  assert.equal(verifyInclusionProof({ proof: included.proof, trustedRoot: applied.receipt.root }), true);
  await stop(); base = await start();
  assert.deepEqual(await (await fetch(`${base}/receipts/stark-integration`)).json(), applied.receipt);
  assert.deepEqual(await (await fetch(`${base}/transactions/${prepared.transaction.tx_id}`)).json(), { transaction: prepared.transaction, proof });
  const replay = await submit({ transaction: prepared.transaction, proof });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).receipt.replayed, true);
  const rejected = await submit({ transaction: { ...prepared.transaction, public_amount: 2 }, proof });
  assert.equal(rejected.status, 400); await rejected.arrayBuffer();
  assert.equal(ledger.latest().height, 1);
  assert.equal(ledger.snapshot().commitments.length, 2);
  const backup = join(directory, 'backup.sqlite');
  await ledger.backupTo(backup);
  const restored = new PersistentLedger({ filename: backup });
  try { assert.deepEqual(restored.receipt(prepared.transaction.request_id), applied.receipt); }
  finally { restored.close(); }
  if (process.env.AEGIS_STARK_PUBLIC_ARTIFACT) {
    writeFileSync(process.env.AEGIS_STARK_PUBLIC_ARTIFACT, JSON.stringify({
      transaction: prepared.transaction, proof, genesis_commitments: [commitment],
    }), { mode: 0o600 });
  }
});
