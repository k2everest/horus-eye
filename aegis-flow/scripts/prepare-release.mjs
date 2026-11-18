import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { LEDGER_SCHEMA_VERSION } from '../services/ledger-state/migrations.mjs';
const [image, destination] = process.argv.slice(2);
if (!image || !destination) throw new Error('Usage: prepare-release.mjs IMAGE NEW_OUTPUT_DIRECTORY');
const root = fileURLToPath(new URL('../../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
if (git(['status','--porcelain'])) throw new Error('RELEASE_REQUIRES_CLEAN_COMMIT');
const commit = git(['rev-parse','HEAD']);
const inspect = JSON.parse(execFileSync('docker', ['image','inspect',image], { encoding: 'utf8' }))[0];
if (inspect.Config.Labels?.['org.opencontainers.image.revision'] !== commit || inspect.Os !== 'linux' || inspect.Architecture !== 'amd64') throw new Error('IMAGE_SOURCE_OR_PLATFORM_MISMATCH');
const approved = JSON.parse(readFileSync(join(root, 'aegis-flow/services/proof-engine/program.json'), 'utf8'));
const run = args => execFileSync('docker', ['run','--rm','--network','none','--read-only','--entrypoint','node',inspect.Id, ...args], { encoding: 'utf8' });
const runtime = JSON.parse(run(['-e', "const fs=require('fs');import('/app/libs/crypto-core/pqc-wrapper.mjs').then(p=>p.assertPqcRuntime());import('/app/services/ledger-state/migrations.mjs').then(m=>console.log(JSON.stringify({node:process.version,program:JSON.parse(fs.readFileSync('/app/services/proof-engine/program.json','utf8')),schema:m.LEDGER_SCHEMA_VERSION})))"]));
if (runtime.schema !== LEDGER_SCHEMA_VERSION || JSON.stringify(runtime.program) !== JSON.stringify(approved) || Number(runtime.node.slice(1).split('.')[0]) < 24) throw new Error('IMAGE_RUNTIME_MISMATCH');
const verifier = execFileSync('docker',['run','--rm','--network','none','--read-only','--entrypoint','sha256sum',inspect.Id,'/opt/aegis/verify-stark'],{encoding:'utf8'}).split(' ')[0];
mkdirSync(destination, { mode: 0o700 });
const compose = join(root, 'aegis-flow/deployments/single-host/compose.yaml');
copyFileSync(compose, join(destination,'compose.yaml'));
const manifest = { schema: 'AEGIS_SINGLE_HOST_RELEASE_V1', kind: 'LAB_STAGING_ONLY', source_commit: commit,
  platform: 'linux/amd64', node: runtime.node, image_id: inspect.Id, image_ref: inspect.RepoDigests?.[0] ?? inspect.Id,
  ledger_schema: LEDGER_SCHEMA_VERSION, program_id: approved.program_id, verifier_sha256: verifier,
  compose_sha256: crypto.createHash('sha256').update(readFileSync(compose)).digest('hex'), single_host: true, replicas: 1, production_ready: false };
writeFileSync(join(destination,'release.json'), JSON.stringify(manifest,null,2), { mode: 0o600, flag:'wx' });
console.log(JSON.stringify(manifest,null,2));
