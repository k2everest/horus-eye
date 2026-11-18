import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { submitProvenTransfer } from '../ledger-state/submit-transfer.mjs';
import { notarizeNextTransfer } from '../ledger-state/settlement.mjs';
import { StarkBackend } from '../proof-engine/backend.mjs';
import { generateSigningKeyPair, signerTag, exportPublicKey } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { createBackup, restoreBackup } from './backup.mjs';

test('recovery drill: encrypted snapshot, lost source host data, native replay and independent anchor', { skip: process.env.AEGIS_RECOVERY_INTEGRATION !== '1' }, async () => {
  const started = performance.now();
  const { transaction, proof, genesis_commitments } = JSON.parse(readFileSync(process.env.AEGIS_RECOVERY_PUBLIC_ARTIFACT ?? new URL('../../../work/stark-smoke-public.json', import.meta.url),'utf8'));
  const directory = mkdtempSync(join(tmpdir(),'aegis-drill-')); const source = join(directory,'source.sqlite');
  const backend = new StarkBackend(); const authority = generateSigningKeyPair(); let ledger;
  try {
    ledger = new PersistentLedger({ filename: source, networkId: transaction.network_id });
    const genesis = ledger.bootstrap({ commitments: genesis_commitments });
    ledger.configureSettlement({ schema:'AEGIS_PERMISSIONED_SETTLEMENT_V1', network_id:transaction.network_id, genesis_root:genesis.root, genesis_count:genesis.commitment_count,
      program_id:backend.programId, authority_public_key:exportPublicKey(authority.publicKey), authority_tag:signerTag(authority.publicKey), signature_algorithm:'ML-DSA-65' });
    assert.equal((await submitProvenTransfer({ ledger, transaction, proof, backend })).valid,true);
    await notarizeNextTransfer({ ledger, privateKey:authority.privateKey, backend });
    const state = ledger.settlementStatus();
    // A tentative trusted-storage transition is intentionally excluded from replay.
    ledger.commitTransition({ transactionId:'91'.repeat(32), requestId:'discarded-pending', expectedRoot:ledger.latest().root,
      inputCommitments:[transaction.output_commitments[0]], newCommitments:['92'.repeat(32)], nullifiers:['93'.repeat(32)] });
    const keyFile = join(directory,'backup.key'); writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
    const backup = await createBackup({ ledgerPath:source, networkId:transaction.network_id, outputDirectory:join(directory,'staging'), keyFile });
    assert.equal(backup.external_copy_completed,false); assert.equal(backup.manifest.context.tip.height,2);
    assert.deepEqual(readdirSync(backup.directory).sort(),['ledger.enc','manifest.json']);
    const offsite = join(directory,'separate-storage-simulation'); mkdirSync(offsite,{mode:0o700});
    for (const name of ['ledger.enc','manifest.json']) copyFileSync(join(backup.directory,name),join(offsite,name));
    ledger.close(); ledger=undefined; rmSync(source); rmSync(join(directory,'staging'),{recursive:true});
    const destination = join(directory,'restored.sqlite');
    const options = {backupDirectory:offsite,destination,keyFile,trustedAnchor:state.finalized,expectedConfigId:state.config_id,backend};
    await assert.rejects(restoreBackup({...options,trustedAnchor:{...state.finalized,checkpoint_id:'00'.repeat(32)}}),/RECOVERY_BELOW/);
    assert.equal(existsSync(destination),false);
    const originalManifest = readFileSync(join(offsite,'manifest.json'),'utf8');
    const tampered = JSON.parse(originalManifest); tampered.context.created_at++;
    writeFileSync(join(offsite,'manifest.json'),JSON.stringify(tampered));
    await assert.rejects(restoreBackup(options),/AUTHENTICATION_FAILED/); assert.equal(existsSync(destination),false);
    writeFileSync(join(offsite,'manifest.json'),originalManifest);
    const result = await restoreBackup(options); assert.equal(result.restored,true); assert.equal(result.discarded_pending_blocks,1);
    ledger = new PersistentLedger({filename:destination,networkId:transaction.network_id,allowMigrations:false,trustedFinalizedCheckpoint:state.finalized});
    assert.equal(ledger.latest().height,1); assert.equal(ledger.hasNullifier(transaction.nullifiers[0]),true);
    assert.equal(ledger.receipt(transaction.request_id).settled,true); assert.equal(ledger.receipt('discarded-pending'),undefined);
    await assert.rejects(restoreBackup(options),/DESTINATION_EXISTS/);
    console.log(JSON.stringify({drill:'local-simulated-storage-loss',native_stark_replay:true,restored_finalized_height:1,elapsed_ms:Math.round(performance.now()-started),real_s3_exercised:false}));
  } finally { ledger?.close(); rmSync(directory,{recursive:true,force:true}); }
});
