import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentLedger } from './store.mjs';
const hex = n => n.toString(16).padStart(64, '0');
function setup(t) { const dir = mkdtempSync(join(tmpdir(), 'aegis-migration-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return join(dir, 'ledger.sqlite'); }
function legacy(filename, version) {
  const ledger = new PersistentLedger({ filename }); ledger.bootstrap({ commitments: [hex(1)] }); ledger.close();
  const db = new DatabaseSync(filename); db.exec('DROP TABLE schema_migrations');
  if (version === 1) db.exec('DROP TABLE finality_certificates; DROP TABLE orphaned_requests');
  db.exec(`PRAGMA user_version=${version}`); db.close();
}
test('v1/v2 upgrade retains state, records honest baselines and refuses auto-migration when disabled', t => {
  for (const version of [1,2]) {
    const filename = setup(t); legacy(filename, version);
    assert.throws(() => new PersistentLedger({ filename, allowMigrations: false }), /MIGRATION_REQUIRED/);
    const ledger = new PersistentLedger({ filename });
    assert.equal(ledger.schemaVersion, 3); assert.equal(ledger.snapshot().commitments[0], hex(1)); ledger.close();
    const db = new DatabaseSync(filename);
    const rows = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    assert.equal(rows.length, 3); assert.equal(rows[0].provenance, 'legacy-baseline'); assert.equal(rows[2].provenance, 'executed'); db.close();
  }
});
test('migration fault rolls back DDL/version; altered history and schema are rejected', t => {
  const filename = setup(t); legacy(filename, 2);
  assert.throws(() => new PersistentLedger({ filename, faultInjector: stage => { if (stage === 'migration_3') throw new Error('injected'); } }), /injected/);
  let db = new DatabaseSync(filename); assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name='schema_migrations'").get(), undefined); db.close();
  const ledger = new PersistentLedger({ filename }); ledger.close();
  db = new DatabaseSync(filename); db.prepare("UPDATE schema_migrations SET source_sha256='bad' WHERE version=1").run(); db.close();
  assert.throws(() => new PersistentLedger({ filename }), /HISTORY_MISMATCH/);
});

test('unexpected triggers on state tables are rejected', t => {
  const filename = setup(t); const ledger = new PersistentLedger({ filename }); ledger.close();
  const db = new DatabaseSync(filename); db.exec('CREATE TRIGGER unexpected AFTER UPDATE ON blocks BEGIN SELECT 1; END'); db.close();
  assert.throws(() => new PersistentLedger({ filename }), /SCHEMA_MISMATCH/);
});
