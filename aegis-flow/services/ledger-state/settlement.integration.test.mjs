import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentLedger } from './store.mjs';
import { submitProvenTransfer } from './submit-transfer.mjs';
import { replayFinalizedTransfer } from './settlement.mjs';
import { generateSigningKeyPair, exportPublicKey, signerTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { StarkBackend } from '../proof-engine/backend.mjs';

test('native STARK: inclusion, authority finality, recovery and anchored restart', { skip: process.env.AEGIS_SETTLEMENT_INTEGRATION !== '1' }, async () => {
  const artifact = process.env.AEGIS_SETTLEMENT_PUBLIC_ARTIFACT ?? new URL('../../../work/stark-smoke-public.json', import.meta.url);
  const { transaction, proof, genesis_commitments } = JSON.parse(readFileSync(artifact, 'utf8'));
  const backend = new StarkBackend();
  assert.equal(backend.availableForVerification(), true);
  const authority = generateSigningKeyPair();
  const directory = mkdtempSync(join(tmpdir(), 'aegis-real-settlement-'));
  const filename = join(directory, 'authority.sqlite');
  let ledger;
  let replica;
  try {
    ledger = new PersistentLedger({ filename, networkId: transaction.network_id });
    const genesis = ledger.bootstrap({ commitments: genesis_commitments });
    const config = { schema: 'AEGIS_PERMISSIONED_SETTLEMENT_V1', network_id: transaction.network_id,
      genesis_root: genesis.root, genesis_count: genesis.commitment_count, program_id: backend.programId,
      authority_public_key: exportPublicKey(authority.publicKey), authority_tag: signerTag(authority.publicKey), signature_algorithm: 'ML-DSA-65' };
    ledger.configureSettlement(config);
    const applied = await submitProvenTransfer({ ledger, transaction, proof, backend });
    assert.equal(applied.valid, true); assert.equal(applied.settled, false);
    const keyPath = join(directory, 'authority.pem');
    const anchorPath = join(directory, 'anchor.json');
    writeFileSync(keyPath, authority.privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    writeFileSync(anchorPath, JSON.stringify(ledger.settlementStatus().finalized), { mode: 0o600 });
    const cli = new URL('../../scripts/settlement-admin.mjs', import.meta.url).pathname;
    const certificate = JSON.parse(execFileSync(process.execPath, [cli, 'notarize', '--ledger', filename, '--network', transaction.network_id,
      '--key', keyPath, '--anchor', anchorPath], { encoding: 'utf8' }));
    assert.equal(ledger.receipt(transaction.request_id).settled, true);
    const backup = join(directory, 'backup.sqlite'); await ledger.backupTo(backup);
    const anchor = ledger.settlementStatus().finalized;
    ledger.close(); ledger = new PersistentLedger({ filename: backup, networkId: transaction.network_id, trustedFinalizedCheckpoint: anchor });
    assert.equal(ledger.receipt(transaction.request_id).checkpoint_id, certificate.checkpoint_id);
    replica = new PersistentLedger({ filename: join(directory, 'replica.sqlite'), networkId: transaction.network_id });
    replica.bootstrap({ commitments: genesis_commitments }); replica.configureSettlement(config);
    const bytes = Buffer.from(proof.receipt, 'base64'); bytes[Math.floor(bytes.length / 2)] ^= 1;
    await assert.rejects(replayFinalizedTransfer({ ledger: replica, transaction, proof: { ...proof, receipt: bytes.toString('base64') }, certificate, backend }), /RECOVERY_TRANSFER_REJECTED/);
    assert.equal(replica.latest().height, 0);
    assert.equal((await replayFinalizedTransfer({ ledger: replica, transaction, proof, certificate, backend })).settled, true);
    assert.equal(replica.settlementStatus().finalized.checkpoint_id, anchor.checkpoint_id);
  } finally { ledger?.close(); replica?.close(); rmSync(directory, { recursive: true, force: true }); }
});
