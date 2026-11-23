import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DatabaseSync, backup } from 'node:sqlite';
import crypto from 'node:crypto';
import { createBackup, restoreBackup } from '../services/recovery/backup.mjs';
import { S3BackupTarget } from '../services/recovery/s3.mjs';
import { PersistentLedger } from '../services/ledger-state/store.mjs';
import { LEDGER_SCHEMA_VERSION } from '../services/ledger-state/migrations.mjs';

const [command, ...args] = process.argv.slice(2);
const options = {};
const allowed = ['ledger','network','directory','key-file','destination','anchor','config-id','s3-config','receipt','backup-id','pre-migration-backup'];
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith('--') || !allowed.includes(args[i].slice(2)) || !args[i + 1] || args[i + 1].startsWith('--') || args[i].slice(2) in options) throw new Error('INVALID_RECOVERY_ARGUMENTS');
  options[args[i].slice(2)] = args[i + 1];
}
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const requireOptions = names => { if (names.some(name => !options[name])) throw new Error(`REQUIRED_OPTIONS:${names.join(',')}`); };
let result;
if (command === 'create-key') {
  requireOptions(['key-file']); writeFileSync(options['key-file'], crypto.randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }); result = { key_file: options['key-file'] };
} else if (command === 'backup') {
  requireOptions(['ledger','network','directory','key-file']);
  result = await createBackup({ ledgerPath: options.ledger, networkId: options.network, outputDirectory: options.directory, keyFile: options['key-file'] });
} else if (command === 'restore') {
  requireOptions(['directory','destination','key-file','anchor','config-id']);
  result = await restoreBackup({ backupDirectory: options.directory, destination: options.destination, keyFile: options['key-file'], trustedAnchor: json(options.anchor), expectedConfigId: options['config-id'] });
} else if (command === 'upload') {
  requireOptions(['directory','s3-config']); result = await new S3BackupTarget(json(options['s3-config'])).upload(options.directory);
} else if (command === 'download') {
  requireOptions(['destination','s3-config','backup-id']); result = await new S3BackupTarget(json(options['s3-config'])).download({ backupId: options['backup-id'], destinationDirectory: options.destination, receipt: options.receipt ? json(options.receipt) : undefined });
} else if (command === 'migrate') {
  requireOptions(['ledger','network','pre-migration-backup']);
  if (!existsSync(options.ledger) || existsSync(options['pre-migration-backup'])) throw new Error('EXISTING_LEDGER_AND_NEW_BACKUP_REQUIRED');
  // Raw backup before opening the application or executing migration SQL.
  const db = new DatabaseSync(options.ledger); const before = db.prepare('PRAGMA user_version').get().user_version;
  if (before > LEDGER_SCHEMA_VERSION) { db.close(); throw new Error('UNSUPPORTED_LEDGER_SCHEMA'); }
  writeFileSync(options['pre-migration-backup'], '', { flag: 'wx', mode: 0o600 });
  try { await backup(db, options['pre-migration-backup']); } finally { db.close(); }
  const ledger = new PersistentLedger({ filename: options.ledger, networkId: options.network });
  try { result = { migrated: true, from: before, to: ledger.schemaVersion, pre_migration_backup: options['pre-migration-backup'] }; } finally { ledger.close(); }
} else throw new Error('Usage: recovery.mjs create-key|backup|restore|upload|download|migrate --OPTION VALUE ...');
console.log(JSON.stringify(result, null, 2));
