import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { join } from 'node:path';
import { LEDGER_SCHEMA_VERSION } from '../ledger-state/migrations.mjs';
export function verifyReleaseBundle(directory, expectedCommit) {
  const release = JSON.parse(readFileSync(join(directory,'release.json'),'utf8'));
  if (release.schema !== 'AEGIS_SINGLE_HOST_RELEASE_V1' || release.source_commit !== expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit) ||
    !/^sha256:[0-9a-f]{64}$/.test(release.image_id) || !/^(?:sha256:[0-9a-f]{64}|[A-Za-z0-9./:_-]+@sha256:[0-9a-f]{64})$/.test(release.image_ref) ||
    release.ledger_schema !== LEDGER_SCHEMA_VERSION || !/^[0-9a-f]{64}$/.test(release.program_id) || !/^[0-9a-f]{64}$/.test(release.verifier_sha256) || release.kind !== 'LAB_STAGING_ONLY' || release.single_host !== true || release.replicas !== 1 || release.production_ready !== false ||
    crypto.createHash('sha256').update(readFileSync(join(directory,'compose.yaml'))).digest('hex') !== release.compose_sha256) throw new Error('RELEASE_BUNDLE_MISMATCH');
  return release;
}
