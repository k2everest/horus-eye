import crypto from 'node:crypto';
import {readFileSync, lstatSync} from 'node:fs';
import {join} from 'node:path';
import {openNetworkId} from './consensus.mjs';

export const releaseHash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export function verifyPowRelease(directory, {expectedCommit, expectedConfigId, expectedProgramId, expectedComposeSha256}) {
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || !hex(expectedConfigId) || !hex(expectedProgramId) || !hex(expectedComposeSha256)) throw Error('TRUSTED_RELEASE_IDENTITIES_REQUIRED');
  const read = name => {
    const path = join(directory, name), stat = lstatSync(path);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw Error('INVALID_RELEASE_FILE');
    return readFileSync(path);
  };
  const manifest = JSON.parse(read('release.json'));
  const keys = 'compose_sha256,config_id,genesis_sha256,image_id,kind,node,platform,production_ready,program_id,schema,source_commit,verifier_sha256';
  if (!manifest || Object.keys(manifest).sort().join(',') !== keys ||
      manifest.schema !== 'AEGIS_OPEN_POW_RELEASE_V1' || manifest.kind !== 'LAB_TESTNET_ONLY' || manifest.production_ready !== false ||
      manifest.source_commit !== expectedCommit || manifest.config_id !== expectedConfigId || manifest.program_id !== expectedProgramId ||
      manifest.compose_sha256 !== expectedComposeSha256 || manifest.platform !== 'linux/amd64' || !/^sha256:[0-9a-f]{64}$/.test(manifest.image_id) ||
      !/^v24\.(?:[89]|[1-9][0-9]+)\.\d+$/.test(manifest.node) || !hex(manifest.verifier_sha256)) throw Error('POW_RELEASE_IDENTITY_MISMATCH');
  const genesis = read('pow-genesis.json'), compose = read('compose.yaml');
  if (releaseHash(genesis) !== manifest.genesis_sha256 || releaseHash(compose) !== manifest.compose_sha256 ||
      openNetworkId(JSON.parse(genesis)) !== expectedConfigId || JSON.parse(genesis).program_id !== expectedProgramId) throw Error('POW_RELEASE_CONTENT_MISMATCH');
  return manifest;
}
