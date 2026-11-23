import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const LEDGER_SCHEMA_VERSION = 3;
const migrations = [
  { version: 1, sql: `CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
          CREATE TABLE IF NOT EXISTS verifications (
            request_id TEXT PRIMARY KEY, tx_id TEXT NOT NULL UNIQUE, receipt_json TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS requests (
            request_id TEXT PRIMARY KEY, tx_id TEXT NOT NULL UNIQUE,
            transition_hash TEXT NOT NULL, receipt_json TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS blocks (
            height INTEGER PRIMARY KEY CHECK(height >= 0), root TEXT NOT NULL,
            previous_root TEXT, commitment_count INTEGER NOT NULL CHECK(commitment_count >= 0),
            tx_id TEXT REFERENCES requests(tx_id)
          ) STRICT;
          CREATE TABLE IF NOT EXISTS public_transactions (
            tx_id TEXT PRIMARY KEY REFERENCES requests(tx_id), transaction_json TEXT NOT NULL, proof_json TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS commitments (
            commitment TEXT PRIMARY KEY CHECK(length(commitment)=64), leaf_index INTEGER NOT NULL UNIQUE,
            created_height INTEGER NOT NULL REFERENCES blocks(height)
          ) STRICT;
          CREATE TABLE IF NOT EXISTS nullifiers (
            nullifier TEXT PRIMARY KEY CHECK(length(nullifier)=64), tx_id TEXT NOT NULL REFERENCES requests(tx_id)
          ) STRICT;
          CREATE TABLE IF NOT EXISTS spent_inputs (
            commitment TEXT PRIMARY KEY REFERENCES commitments(commitment),
            tx_id TEXT NOT NULL REFERENCES requests(tx_id)
          ) STRICT;` },
  { version: 2, sql: `CREATE TABLE IF NOT EXISTS finality_certificates (
            height INTEGER PRIMARY KEY REFERENCES blocks(height), checkpoint_id TEXT NOT NULL UNIQUE, certificate_json TEXT NOT NULL
          ) STRICT;
          CREATE TABLE IF NOT EXISTS orphaned_requests (
            id INTEGER PRIMARY KEY, request_id TEXT NOT NULL, tx_id TEXT NOT NULL, receipt_json TEXT NOT NULL
          ) STRICT;` },
  { version: 3, sql: `CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY, source_sha256 TEXT NOT NULL, provenance TEXT NOT NULL
      CHECK(provenance IN ('executed','legacy-baseline'))
    ) STRICT;` },
];
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const sourceHash = migration => digest(migration.sql);
const normalizedSchema = (db, names) => db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all()
  .filter(row => names.includes(row.name)).map(row => [row.name, row.sql.replace(/\s+/g, ' ').trim()]);
const expected = new DatabaseSync(':memory:');
for (const migration of migrations) expected.exec(migration.sql);
const tableNames = expected.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name);
const expectedSchema = normalizedSchema(expected, tableNames); expected.close();

// Caller holds BEGIN IMMEDIATE. There are no automatic down migrations.
export function migrateLedger(db, { allowMigrations = true, faultInjector = () => {} } = {}) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > LEDGER_SCHEMA_VERSION) throw new Error('UNSUPPORTED_LEDGER_SCHEMA');
  if (version < LEDGER_SCHEMA_VERSION && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get()) throw new Error('LEDGER_SCHEMA_VERSION_MISMATCH');
  if (version < LEDGER_SCHEMA_VERSION && !allowMigrations) throw new Error('LEDGER_MIGRATION_REQUIRED');
  if (version === LEDGER_SCHEMA_VERSION) {
    const journal = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    if (journal.length !== migrations.length || journal.some((row, i) => row.version !== migrations[i].version || row.source_sha256 !== sourceHash(migrations[i]) || !['executed','legacy-baseline'].includes(row.provenance))) throw new Error('LEDGER_MIGRATION_HISTORY_MISMATCH');
  } else {
    for (const migration of migrations) {
      if (migration.version > version) { db.exec(migration.sql); faultInjector(`migration_${migration.version}`); }
    }
    for (const migration of migrations) db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)')
      .run(migration.version, sourceHash(migration), migration.version <= version ? 'legacy-baseline' : 'executed');
    db.exec(`PRAGMA user_version=${LEDGER_SCHEMA_VERSION}`);
  }
  if (JSON.stringify(normalizedSchema(db, tableNames)) !== JSON.stringify(expectedSchema) ||
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND tbl_name IN (" + tableNames.map(() => '?').join(',') + ')').get(...tableNames)) throw new Error('LEDGER_SCHEMA_MISMATCH');
  return LEDGER_SCHEMA_VERSION;
}
