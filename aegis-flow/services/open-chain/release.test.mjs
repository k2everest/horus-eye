import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {releaseHash, verifyPowRelease} from './release.mjs';
import {openNetworkId} from './consensus.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(),'pow-release-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const config = {schema:'AEGIS_OPEN_POW_V2',network_id:'release-test',program_id:'42'.repeat(32),genesis_time_ms:0,
    pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,
    monetary:{asset_id:'TEST',base_reward:7,max_supply:'700'}};
  const genesis = JSON.stringify(config), compose = 'services: {}\n';
  const manifest = {schema:'AEGIS_OPEN_POW_RELEASE_V1',kind:'LAB_TESTNET_ONLY',production_ready:false,
    source_commit:'ab'.repeat(20),config_id:openNetworkId(config),program_id:config.program_id,platform:'linux/amd64',
    node:'v24.8.0',image_id:'sha256:'+'12'.repeat(32),verifier_sha256:'34'.repeat(32),
    genesis_sha256:releaseHash(genesis),compose_sha256:releaseHash(compose)};
  writeFileSync(join(directory,'pow-genesis.json'),genesis);
  writeFileSync(join(directory,'compose.yaml'),compose);
  const save = () => writeFileSync(join(directory,'release.json'),JSON.stringify(manifest)); save();
  const trusted = {expectedCommit:manifest.source_commit,expectedConfigId:manifest.config_id,expectedProgramId:manifest.program_id,expectedComposeSha256:manifest.compose_sha256};
  return {directory,manifest,config,trusted,save};
}
test('PoW bundle requires independently trusted commit, genesis and approved program', t => {
  const f = fixture(t);
  assert.equal(verifyPowRelease(f.directory,f.trusted).production_ready,false);
  for (const key of Object.keys(f.trusted)) assert.throws(() => verifyPowRelease(f.directory,{...f.trusted,[key]:'99'.repeat(key==='expectedCommit'?20:32)}),/MISMATCH/);
  f.manifest.image_id = 'node:latest'; f.save();
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/MISMATCH/);
});
test('altered economic rules fail even when the manifest checksum is recomputed', t => {
  const f = fixture(t); f.config.monetary.max_supply = '701';
  const bytes = JSON.stringify(f.config); writeFileSync(join(f.directory,'pow-genesis.json'),bytes);
  f.manifest.genesis_sha256 = releaseHash(bytes); f.save();
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/CONTENT_MISMATCH/);
});
test('bundle rejects altered compose, symlinks and fabricated production status', t => {
  const f = fixture(t); writeFileSync(join(f.directory,'compose.yaml'),'altered');
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/CONTENT_MISMATCH/);
  f.manifest.compose_sha256 = releaseHash('altered'); f.save();
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/IDENTITY_MISMATCH/);
  f.manifest.compose_sha256 = f.trusted.expectedComposeSha256; f.save();
  rmSync(join(f.directory,'compose.yaml')); symlinkSync('pow-genesis.json',join(f.directory,'compose.yaml'));
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/INVALID_RELEASE_FILE/);
  f.manifest.production_ready = true; f.save();
  assert.throws(() => verifyPowRelease(f.directory,f.trusted),/IDENTITY_MISMATCH/);
});
