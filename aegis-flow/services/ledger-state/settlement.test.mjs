import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PersistentLedger } from './store.mjs';
import { submitProvenTransfer } from './submit-transfer.mjs';
import { notarizeNextTransfer, replayFinalizedTransfer } from './settlement.mjs';
import { checkpointId, signFinalityCheckpoint, verifyFinalityCertificate } from './finality.mjs';
import { createValidationServer } from '../validation-gateway/server.mjs';
import { createSpendIdentity, createPrivateNote, noteCommitmentV2 } from '../../libs/crypto-core/shielded-note-v2.mjs';
import { generateSigningKeyPair, generateKemKeyPair, exportPublicKey, signerTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { prepareTransferV2 } from '../../libs/crypto-core/transfer-v2.mjs';
import { starkStatementDigest } from '../../libs/crypto-core/stark-statement.mjs';
import { verifyInclusionProof } from '../../libs/crypto-core/merkle-proof.mjs';

const programId = '42'.repeat(32);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = promisify(execFile);
// Storage/protocol tests use an explicit proof-verification double. Native STARK
// coverage is separate in settlement.integration.test.mjs; no double is exported.
const backend = { programId, availableForVerification: () => true,
  verify: async ({ proof }) => ({ valid: proof.receipt === Buffer.from('test-only').toString('base64'),
    program_id: programId, proof_digest: digest(Buffer.from(proof.receipt, 'base64')) }) };

function setup(t, faultInjector) {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-settlement-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const authority = generateSigningKeyPair();
  const signer = generateSigningKeyPair();
  const recipient = generateKemKeyPair();
  const owner = createSpendIdentity();
  const note = createPrivateNote({ ownerTag: owner.owner_tag, value: 7 });
  const filename = join(directory, 'ledger.sqlite');
  const ledger = new PersistentLedger({ filename, faultInjector });
  t.after(() => ledger.close());
  const genesis = ledger.bootstrap({ commitments: [noteCommitmentV2(note)] });
  const config = { schema: 'AEGIS_PERMISSIONED_SETTLEMENT_V1', network_id: ledger.networkId,
    genesis_root: genesis.root, genesis_count: 1, program_id: programId,
    authority_public_key: exportPublicKey(authority.publicKey), authority_tag: signerTag(authority.publicKey), signature_algorithm: 'ML-DSA-65' };
  ledger.configureSettlement(config);
  const prepare = (requestId, inputNote = note, inputOwner = owner) => {
    const nextOwner = createSpendIdentity();
    const output = createPrivateNote({ ownerTag: nextOwner.owner_tag, value: inputNote.value });
    const prepared = prepareTransferV2({ requestId, privateKey: signer.privateKey, anchorStateRoot: ledger.latest().root,
      inputs: [{ note: inputNote, spend_secret: inputOwner.spend_secret, membership: ledger.inclusionProof({ commitment: noteCommitmentV2(inputNote) }).proof }],
      outputs: [{ note: output, recipientPublicKey: recipient.publicKey }] });
    const proof = { scheme: 'RISC0-COMPOSITE-STARK-V1', program_id: programId, statement_digest: starkStatementDigest(prepared.statement), receipt: Buffer.from('test-only').toString('base64') };
    return { transaction: prepared.transaction, proof, output, owner: nextOwner };
  };
  const apply = bundle => submitProvenTransfer({ ledger, ...bundle, backend });
  const sign = () => notarizeNextTransfer({ ledger, privateKey: authority.privateKey, backend });
  return { directory, filename, ledger, authority, config, prepare, apply, sign };
}

test('finality is explicit, contiguous, ML-DSA signed and durable; config cannot rotate silently', async t => {
  const f = setup(t);
  const bundle = f.prepare('first');
  assert.equal((await f.apply(bundle)).valid, true);
  assert.equal(f.ledger.receipt('first').finality_status, 'PENDING');
  assert.equal(f.ledger.receipt('first').settled, false);
  assert.throws(() => f.ledger.configureSettlement({ ...f.config, program_id: '43'.repeat(32) }), /IMMUTABLE/);
  const checkpoint = f.ledger.nextFinalityCheckpoint();
  assert.throws(() => f.ledger.notarize({ privateKey: generateSigningKeyPair().privateKey, expectedCheckpointId: checkpointId(checkpoint) }), /WRONG_FINALITY_AUTHORITY/);
  const cert = await f.sign();
  assert.equal(verifyFinalityCertificate({ config: f.config, certificate: cert, expectedCheckpoint: checkpoint }), true);
  assert.deepEqual(f.ledger.acceptFinality(cert), cert);
  assert.equal(f.ledger.receipt('first').settled, true);
  assert.equal(f.ledger.receipt('first').status, 'FINALIZED_PERMISSIONED');
  assert.equal(f.ledger.receipt('first').production_ready, false);
  assert.equal((await f.apply(bundle)).receipt.replayed, true);
  const included = f.ledger.finalizedInclusionProof(bundle.transaction.output_commitments[0]);
  assert.equal(verifyInclusionProof({ proof: included.proof, trustedRoot: cert.checkpoint.root }), true);
  assert.equal(included.checkpoint_id, cert.checkpoint_id);
  const anchor = f.ledger.settlementStatus().finalized;
  f.ledger.close();
  const restored = new PersistentLedger({ filename: f.filename, trustedFinalizedCheckpoint: anchor });
  try { assert.equal(restored.receipt('first').settled, true); assert.deepEqual(restored.finalizedBlock(1).certificate, cert); }
  finally { restored.close(); }
});

test('forged, cross-config and out-of-order finality do not advance finalized head', async t => {
  const f = setup(t);
  const a = f.prepare('a'); await f.apply(a);
  const cp = f.ledger.nextFinalityCheckpoint();
  const cert = signFinalityCheckpoint({ config: f.config, checkpoint: cp, privateKey: f.authority.privateKey });
  for (const invalid of [
    { ...cert, signature: '0'.repeat(cert.signature.length) },
    { ...cert, checkpoint: { ...cp, root: '99'.repeat(32) } },
    signFinalityCheckpoint({ config: f.config, checkpoint: { ...cp, height: 2 }, privateKey: f.authority.privateKey }),
    signFinalityCheckpoint({ config: f.config, checkpoint: { ...cp, config_id: '99'.repeat(32) }, privateKey: f.authority.privateKey }),
    { ...cert, extra: true },
  ]) {
    assert.throws(() => f.ledger.acceptFinality(invalid), /INVALID_FINALITY/);
    assert.equal(f.ledger.settlementStatus().finalized.height, 0);
  }
  f.ledger.acceptFinality(cert);
  assert.throws(() => f.ledger.acceptFinality({ ...cert, checkpoint_id: '99'.repeat(32) }), /FINALITY_CONFLICT/);
});

test('reorganization removes only pending suffix and restores inputs/nullifiers atomically', async t => {
  const f = setup(t);
  const a = f.prepare('a'); await f.apply(a); await f.sign();
  const anchor = f.ledger.settlementStatus().finalized;
  const b = f.prepare('b', a.output, a.owner); await f.apply(b);
  assert.throws(() => f.ledger.finalizedInclusionProof(b.transaction.output_commitments[0]), /UNKNOWN_COMMITMENT/);
  assert.throws(() => f.ledger.rewindToFinalized({ expectedFinalizedCheckpointId: '00'.repeat(32) }), /ANCHOR_MISMATCH/);
  const result = f.ledger.rewindToFinalized({ expectedFinalizedCheckpointId: anchor.checkpoint_id });
  assert.equal(result.removed, 1);
  assert.equal(f.ledger.latest().height, 1);
  assert.equal(f.ledger.receipt('a').settled, true);
  assert.equal(f.ledger.receipt('b').status, 'ORPHANED');
  assert.equal(f.ledger.publicTransaction(b.transaction.tx_id), undefined);
  assert.equal(f.ledger.hasNullifier(b.transaction.nullifiers[0]), false);
  const replacement = f.prepare('replacement', a.output, a.owner);
  assert.equal((await f.apply(replacement)).valid, true);
  await f.sign();
  assert.equal(f.ledger.settlementStatus().finalized.height, 2);
  assert.equal(f.ledger.rewindToFinalized({ expectedFinalizedCheckpointId: f.ledger.settlementStatus().finalized.checkpoint_id }).removed, 0);
});

test('failure while committing certificate or rewind rolls back every change', async t => {
  let fail;
  const f = setup(t, stage => { if (stage === fail) throw new Error('injected'); });
  const a = f.prepare('a'); await f.apply(a);
  fail = 'after_finality_certificate';
  await assert.rejects(f.sign(), /injected/);
  assert.equal(f.ledger.settlementStatus().finalized.height, 0);
  fail = undefined; await f.sign();
  const b = f.prepare('b', a.output, a.owner); await f.apply(b);
  fail = 'after_rewind';
  assert.throws(() => f.ledger.rewindToFinalized({ expectedFinalizedCheckpointId: f.ledger.settlementStatus().finalized.checkpoint_id }), /injected/);
  assert.equal(f.ledger.latest().height, 2);
  assert.equal(f.ledger.receipt('b').finality_status, 'PENDING');
  assert.equal(f.ledger.hasNullifier(b.transaction.nullifiers[0]), true);
});

test('old backup is rejected against external watermark; damaged certificate fails restart', async t => {
  const f = setup(t);
  const before = join(f.directory, 'old.sqlite'); await f.ledger.backupTo(before);
  await f.apply(f.prepare('a')); await f.sign();
  const anchor = f.ledger.settlementStatus().finalized;
  assert.throws(() => new PersistentLedger({ filename: before, trustedFinalizedCheckpoint: anchor }), /RECOVERY_BELOW/);
  const conflicting = { ...anchor, checkpoint_id: '99'.repeat(32) };
  assert.throws(() => new PersistentLedger({ filename: f.filename, trustedFinalizedCheckpoint: conflicting }), /RECOVERY_BELOW/);
  f.ledger.close();
  const db = new DatabaseSync(f.filename);
  const cert = JSON.parse(db.prepare('SELECT certificate_json FROM finality_certificates').get().certificate_json);
  cert.signature = '0'.repeat(cert.signature.length);
  db.prepare('UPDATE finality_certificates SET certificate_json=?').run(JSON.stringify(cert)); db.close();
  assert.throws(() => new PersistentLedger({ filename: f.filename }), /FINALITY_RECOVERY_FAILED/);
});

test('replica recovery verifies transfer and certificate before reporting settlement', async t => {
  const f = setup(t);
  const bundle = f.prepare('a'); await f.apply(bundle); const certificate = await f.sign();
  const replica = new PersistentLedger({ filename: join(f.directory, 'replica.sqlite') });
  t.after(() => replica.close());
  replica.bootstrap({ commitments: f.ledger.snapshot(0).commitments }); replica.configureSettlement(f.config);
  await assert.rejects(replayFinalizedTransfer({ ledger: replica, ...bundle, certificate: { ...certificate, signature: '00' }, backend }), /INVALID_RECOVERY/);
  assert.equal(replica.latest().height, 0);
  const result = await replayFinalizedTransfer({ ledger: replica, ...bundle, certificate, backend });
  assert.equal(result.settled, true);
  assert.deepEqual(replica.settlementStatus().finalized, f.ledger.settlementStatus().finalized);
});

test('notary reverifies proof and handles asynchronous candidate replacement safely', async t => {
  const f = setup(t);
  const a = f.prepare('a'); await f.apply(a);
  await assert.rejects(notarizeNextTransfer({ ledger: f.ledger, privateKey: f.authority.privateKey,
    backend: { ...backend, verify: async () => ({ valid: false }) } }), /REVERIFICATION_FAILED/);
  let release; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const delayed = { ...backend, verify: async args => { const result = await backend.verify(args); entered(); await gate; return result; } };
  const pending = notarizeNextTransfer({ ledger: f.ledger, privateKey: f.authority.privateKey, backend: delayed });
  await ready;
  f.ledger.rewindToFinalized({ expectedFinalizedCheckpointId: f.ledger.settlementStatus().finalized.checkpoint_id });
  await f.apply(f.prepare('replacement'));
  release();
  await assert.rejects(pending, /CANDIDATE_CHANGED/);
  assert.equal(f.ledger.settlementStatus().finalized.height, 0);
});

test('HTTP exposes finality evidence and accepts only certificates, never signing keys', async t => {
  const f = setup(t);
  const a = f.prepare('a'); await f.apply(a);
  const checkpoint = f.ledger.nextFinalityCheckpoint();
  const certificate = signFinalityCheckpoint({ config: f.config, checkpoint, privateKey: f.authority.privateKey });
  const server = createValidationServer({ ledgerPath: f.filename, starkBackend: backend });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = value => fetch(`${base}/settlement/certificates`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await fetch(`${base}/settlement/blocks/1`)).status, 404);
  assert.equal((await post({ certificate: { ...certificate, signature: '00' } })).status, 400);
  assert.equal((await post({ certificate, privateKey: 'forbidden' })).status, 400);
  assert.equal((await post({ certificate })).status, 200);
  assert.equal((await (await fetch(`${base}/receipts/a`)).json()).settled, true);
  assert.equal((await (await fetch(`${base}/settlement/blocks/1`)).json()).certificate.checkpoint_id, certificate.checkpoint_id);
  assert.equal((await (await fetch(`${base}/settlement/proof/${a.transaction.output_commitments[0]}`)).json()).checkpoint_id, certificate.checkpoint_id);
  assert.equal((await (await fetch(`${base}/settlement/status`)).json()).finalized.height, 1);
});

test('SIGKILL before finality commit recovers pending; competing notary processes issue once', async t => {
  const f = setup(t);
  await f.apply(f.prepare('crash-and-race'));
  const expected = checkpointId(f.ledger.nextFinalityCheckpoint());
  const keyPath = join(f.directory, 'authority.pem');
  writeFileSync(keyPath, f.authority.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const module = new URL('./store.mjs', import.meta.url).href;
  const code = `import {readFileSync} from 'node:fs'; import {createPrivateKey} from 'node:crypto';
    import {PersistentLedger} from ${JSON.stringify(module)};
    const ledger=new PersistentLedger({filename:process.argv[1],faultInjector:stage=>{if(process.argv[4]==='crash'&&stage==='after_finality_certificate')process.kill(process.pid,'SIGKILL')}});
    try{const cert=ledger.notarize({privateKey:createPrivateKey(readFileSync(process.argv[2])),expectedCheckpointId:process.argv[3]}); console.log(cert.checkpoint_id)}
    catch{console.log('REJECTED')}finally{ledger.close()}`;
  const args = ['--input-type=module', '-e', code, f.filename, keyPath, expected];
  await assert.rejects(run(process.execPath, [...args, 'crash']), error => error.signal === 'SIGKILL');
  assert.equal(f.ledger.settlementStatus().finalized.height, 0);
  const results = await Promise.all([run(process.execPath, args), run(process.execPath, args)]);
  assert.equal(results.filter(result => result.stdout.trim() === expected).length, 1);
  assert.equal(results.filter(result => result.stdout.trim() === 'REJECTED').length, 1);
  assert.equal(f.ledger.settlementStatus().finalized.height, 1);
});
