import crypto from 'node:crypto';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { reviewStarkSecurity } from '../services/proof-engine/security-review.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = [
  'aegis-flow/services/proof-engine/program.json',
  'aegis-flow/services/proof-engine/security-profile.json',
  'aegis-flow/services/proof-engine/security-review.mjs',
  'aegis-flow/scripts/review-stark-security.mjs',
  'aegis-flow/services/proof-engine/tools.lock.json',
  'aegis-flow/services/proof-engine/guest/Cargo.toml',
  'aegis-flow/services/proof-engine/guest/Cargo.lock',
  'aegis-flow/services/proof-engine/guest/src/main.rs',
  'aegis-flow/services/proof-engine/verifier/Cargo.toml',
  'aegis-flow/services/proof-engine/verifier/Cargo.lock',
  'aegis-flow/services/proof-engine/verifier/src/main.rs',
  'aegis-flow/services/proof-engine/backend.mjs',
  'aegis-flow/libs/crypto-core/pqc-wrapper.mjs',
  'aegis-flow/libs/crypto-core/canonical-transcript.mjs',
  'aegis-flow/libs/crypto-core/sealed-envelope.mjs',
  'aegis-flow/libs/crypto-core/shielded-note-v2.mjs',
  'aegis-flow/libs/crypto-core/stark-statement.mjs',
  'aegis-flow/libs/crypto-core/transfer-v2.mjs',
  'aegis-flow/libs/crypto-core/prover-v1.mjs',
  'aegis-flow/libs/crypto-core/verifier-v1.mjs',
  'aegis-flow/libs/crypto-core/merkle-proof.mjs',
  'aegis-flow/services/ledger-state/store.mjs',
  'aegis-flow/services/ledger-state/submit-transfer.mjs',
  'aegis-flow/services/ledger-state/finality.mjs',
  'aegis-flow/services/ledger-state/settlement.mjs',
  'aegis-flow/scripts/settlement-admin.mjs',
  'aegis-flow/services/operational-security/access.mjs',
  'aegis-flow/services/operational-security/telemetry.mjs',
  'aegis-flow/scripts/ops-access.mjs',
  'aegis-flow/services/wallet-local/vault.mjs',
  'aegis-flow/services/wallet-local/wallet.mjs',
  'aegis-flow/services/wallet-local/server.mjs',
  'src/lib/queer-wallet.ts',
  'src/pages/QueerWallet.tsx',
  'aegis-flow/services/validation-gateway/server.mjs',
  'aegis-flow/services/validation-gateway/runtime-policy.mjs',
];
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const program = JSON.parse(readFileSync(join(root, files[0]), 'utf8'));
const artifacts = {};
for (const name of ['work/risc0/bin/r0vm', 'work/risc0/aegis-transfer.bin', 'work/stark-target/host/release/aegis-stark-verifier']) {
  if (!existsSync(join(root, name))) { artifacts[name] = null; continue; }
  const digest = crypto.createHash('sha256');
  for await (const chunk of createReadStream(join(root, name))) digest.update(chunk);
  artifacts[name] = digest.digest('hex');
}
console.log(JSON.stringify({
  schema: 'AEGIS_AUDIT_MANIFEST_V1', commit: git(['rev-parse', 'HEAD']),
  working_tree_dirty: git(['status', '--porcelain']).length > 0,
  node_version: process.version, program_id: program.program_id,
  independent_audit_completed: false, production_ready: false,
  stark_security_review: reviewStarkSecurity(),
  default_local_artifact_sha256: artifacts,
  file_sha256: Object.fromEntries(files.map(name => [name, crypto.createHash('sha256').update(readFileSync(join(root, name))).digest('hex')])),
}, null, 2));
