import crypto from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, createReadStream, createWriteStream, rmSync, existsSync, linkSync, unlinkSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { LEDGER_SCHEMA_VERSION } from '../ledger-state/migrations.mjs';
import { replayFinalizedTransfer } from '../ledger-state/settlement.mjs';
import { canonicalSerialize } from '../../libs/crypto-core/canonical-transcript.mjs';
import { readBearerSecret } from '../operational-security/access.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';

export async function fileDigest(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
const keyId = key => crypto.createHash('sha256').update('AEGIS_BACKUP_KEY_V1\0').update(key).digest('hex');
function syncFile(path) { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } }
function assertManifest(manifest) {
  const expected = 'ciphertext_sha256,context,nonce,tag';
  const c = manifest?.context;
  if (!manifest || Object.keys(manifest).sort().join(',') !== expected || !c ||
    Object.keys(c).sort().join(',') !== 'backup_id,config_id,created_at,finalized,key_id,ledger_schema,network_id,recovery_scope,schema,tip' ||
    c.schema !== 'AEGIS_EXTERNAL_BACKUP_V1' || c.ledger_schema !== LEDGER_SCHEMA_VERSION || c.recovery_scope !== 'verified-finalized-prefix' ||
    !/^[0-9a-f-]{36}$/.test(c.backup_id) || typeof c.network_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(c.network_id) ||
    ![c.config_id, c.key_id, manifest.ciphertext_sha256].every(v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)) ||
    !/^[0-9a-f]{24}$/.test(manifest.nonce) || !/^[0-9a-f]{32}$/.test(manifest.tag) || !Number.isSafeInteger(c.created_at) || c.created_at < 0 || !Number.isSafeInteger(c.tip?.height) || c.tip.height < c.finalized?.height ||
    !Number.isSafeInteger(c.finalized?.height) || c.finalized.height < 0 || !/^[0-9a-f]{64}$/.test(c.finalized.checkpoint_id)) throw new Error('INVALID_BACKUP_MANIFEST');
}
export async function createBackup({ ledgerPath, outputDirectory, keyFile, networkId }) {
  const key = Buffer.from(readBearerSecret(keyFile), 'hex');
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const id = crypto.randomUUID(); const destination = join(outputDirectory, id);
  mkdirSync(destination, { mode: 0o700 });
  let source; let snapshot;
  const plain = join(destination, 'snapshot.sqlite');
  try {
    if (!existsSync(ledgerPath)) throw new Error('SOURCE_LEDGER_NOT_FOUND');
    source = new PersistentLedger({ filename: ledgerPath, networkId, allowMigrations: false });
    await source.backupTo(plain); source.close(); source = undefined;
    snapshot = new PersistentLedger({ filename: plain, networkId, allowMigrations: false });
    const state = snapshot.settlementStatus();
    if (!state) throw new Error('BACKUP_REQUIRES_CONFIGURED_SETTLEMENT');
    const context = { schema: 'AEGIS_EXTERNAL_BACKUP_V1', backup_id: id, created_at: Date.now(), ledger_schema: snapshot.schemaVersion,
      network_id: snapshot.networkId, config_id: state.config_id, finalized: state.finalized, tip: snapshot.latest(),
      key_id: keyId(key), recovery_scope: 'verified-finalized-prefix' };
    snapshot.close(); snapshot = undefined;
    const nonce = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(canonicalSerialize(context)));
    const encrypted = join(destination, 'ledger.enc');
    await pipeline(createReadStream(plain), cipher, createWriteStream(encrypted, { flags: 'wx', mode: 0o600 }));
    const manifest = { context, nonce: nonce.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext_sha256: await fileDigest(encrypted) };
    syncFile(encrypted);
    writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600, flag: 'wx' });
    syncFile(join(destination, 'manifest.json'));
    unlinkSync(plain); syncFile(destination);
    return { directory: resolve(destination), manifest, external_copy_completed: false };
  } catch (error) { snapshot?.close(); source?.close(); rmSync(destination, { recursive: true, force: true }); throw error; }
  finally { key.fill(0); }
}

export async function restoreBackup({ backupDirectory, destination, keyFile, trustedAnchor, expectedConfigId, backend = defaultStarkBackend() }) {
  // A separately acquired anchor and config ID are mandatory; the backup cannot
  // vouch for its own freshness or authority.
  if (!trustedAnchor || !Number.isSafeInteger(trustedAnchor.height) || trustedAnchor.height < 0 || !/^[0-9a-f]{64}$/.test(trustedAnchor.checkpoint_id) ||
    typeof expectedConfigId !== 'string' || !/^[0-9a-f]{64}$/.test(expectedConfigId)) throw new Error('INDEPENDENT_RECOVERY_ANCHOR_AND_CONFIG_REQUIRED');
  if (existsSync(destination)) throw new Error('RESTORE_DESTINATION_EXISTS');
  const manifestBytes = readFileSync(join(backupDirectory, 'manifest.json'));
  if (manifestBytes.length > 65536) throw new Error('INVALID_BACKUP_MANIFEST');
  const manifest = JSON.parse(manifestBytes.toString('utf8')); assertManifest(manifest);
  if (manifest.context.config_id !== expectedConfigId) throw new Error('RECOVERY_CONFIG_MISMATCH');
  const key = Buffer.from(readBearerSecret(keyFile), 'hex');
  mkdirSync(dirname(resolve(destination)), { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dirname(resolve(destination)), '.aegis-restore-'));
  let snapshot; let recovered;
  try {
    if (manifest.context.key_id !== keyId(key) || await fileDigest(join(backupDirectory, 'ledger.enc')) !== manifest.ciphertext_sha256) throw new Error('BACKUP_KEY_OR_CHECKSUM_MISMATCH');
    const plain = join(staging, 'snapshot.sqlite');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(manifest.nonce, 'hex'));
    decipher.setAAD(Buffer.from(canonicalSerialize(manifest.context))); decipher.setAuthTag(Buffer.from(manifest.tag, 'hex'));
    try { await pipeline(createReadStream(join(backupDirectory, 'ledger.enc')), decipher, createWriteStream(plain, { flags: 'wx', mode: 0o600 })); }
    catch { throw new Error('BACKUP_AUTHENTICATION_FAILED'); }
    snapshot = new PersistentLedger({ filename: plain, networkId: manifest.context.network_id, allowMigrations: false, trustedFinalizedCheckpoint: trustedAnchor });
    const state = snapshot.settlementStatus();
    if (!state || state.config_id !== expectedConfigId || canonicalSerialize(state.finalized) !== canonicalSerialize(manifest.context.finalized)) throw new Error('BACKUP_STATE_MISMATCH');
    const rebuilt = join(staging, 'recovered.sqlite');
    recovered = new PersistentLedger({ filename: rebuilt, networkId: snapshot.networkId });
    recovered.bootstrap({ commitments: snapshot.snapshot(0).commitments }); recovered.configureSettlement(snapshot.settlementConfig());
    for (let height = 1; height <= state.finalized.height; height++) await replayFinalizedTransfer({ ledger: recovered, ...snapshot.finalizedBlock(height), backend });
    if (canonicalSerialize(recovered.settlementStatus().finalized) !== canonicalSerialize(state.finalized)) throw new Error('RESTORE_REPLAY_MISMATCH');
    recovered.close(); recovered = undefined; snapshot.close(); snapshot = undefined;
    syncFile(rebuilt);
    // link fails atomically if someone created destination in the meantime.
    linkSync(rebuilt, destination); syncFile(dirname(resolve(destination)));
    return { restored: true, destination: resolve(destination), finalized: state.finalized, config_id: expectedConfigId,
      recovery_scope: 'verified-finalized-prefix', discarded_pending_blocks: manifest.context.tip.height - state.finalized.height, production_ready: false };
  } finally { recovered?.close(); snapshot?.close(); key.fill(0); rmSync(staging, { recursive: true, force: true }); }
}
