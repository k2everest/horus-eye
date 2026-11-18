import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {openNetworkId} from '../services/open-chain/consensus.mjs';
import {verifyPowRelease, releaseHash} from '../services/open-chain/release.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const {positionals, values: v} = parseArgs({allowPositionals: true, options: {
  image: {type:'string'}, genesis: {type:'string'}, directory: {type:'string'},
  'expected-commit': {type:'string'}, 'expected-config-id': {type:'string'},
}});
const run = (command, args) => execFileSync(command, args, {cwd:root, encoding:'utf8', timeout:120000, maxBuffer:1024*1024});
const approved = JSON.parse(readFileSync(join(root,'aegis-flow/services/proof-engine/program.json')));
function inspectImage(id, commit) {
  const image = JSON.parse(run('docker', ['image','inspect',id]))[0];
  if (!/^sha256:[0-9a-f]{64}$/.test(image?.Id) || image.Os !== 'linux' || image.Architecture !== 'amd64' || image.Config?.Labels?.['org.opencontainers.image.revision'] !== commit) throw Error('IMAGE_SOURCE_OR_PLATFORM_MISMATCH');
  const isolated = args => run('docker', ['run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','64','--memory','256m','--entrypoint','node',image.Id,...args]);
  const runtime = JSON.parse(isolated(['--input-type=module','-e', `import fs from 'node:fs'; import {assertPqcRuntime} from '/app/libs/crypto-core/pqc-wrapper.mjs'; assertPqcRuntime(); await import('/app/services/open-chain/chain.mjs'); console.log(JSON.stringify({node:process.version,program:JSON.parse(fs.readFileSync('/app/services/proof-engine/program.json'))}));`]));
  if (JSON.stringify(runtime.program) !== JSON.stringify(approved)) throw Error('IMAGE_PROGRAM_MISMATCH');
  const verifier = isolated(['--input-type=module','-e', `import fs from 'node:fs';import crypto from 'node:crypto';console.log(crypto.createHash('sha256').update(fs.readFileSync('/opt/aegis/verify-stark')).digest('hex'));`]).trim();
  return {image_id:image.Id, node:runtime.node, verifier_sha256:verifier};
}
try {
  if (!v.directory || positionals.length !== 1) throw Error('INVALID_RELEASE_ARGUMENTS');
  if (positionals[0] === 'prepare') {
    if (!v.image || !v.genesis) throw Error('IMAGE_AND_GENESIS_REQUIRED');
    if (run('git',['status','--porcelain']).trim()) throw Error('RELEASE_REQUIRES_CLEAN_COMMIT');
    const commit = run('git',['rev-parse','HEAD']).trim(), genesis = readFileSync(v.genesis);
    const config = JSON.parse(genesis), configId = openNetworkId(config);
    if (config.program_id !== approved.program_id) throw Error('GENESIS_PROGRAM_MISMATCH');
    const runtime = inspectImage(v.image, commit);
    const compose = join(root,'aegis-flow/deployments/open-pow/compose.yaml');
    const manifest = {schema:'AEGIS_OPEN_POW_RELEASE_V1',kind:'LAB_TESTNET_ONLY',production_ready:false,
      source_commit:commit,config_id:configId,program_id:approved.program_id,platform:'linux/amd64',...runtime,
      genesis_sha256:releaseHash(genesis),compose_sha256:releaseHash(readFileSync(compose))};
    mkdirSync(v.directory,{mode:0o700});
    try {
      writeFileSync(join(v.directory,'pow-genesis.json'),genesis,{flag:'wx',mode:0o600});
      copyFileSync(compose,join(v.directory,'compose.yaml'));
      writeFileSync(join(v.directory,'release.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
      verifyPowRelease(v.directory,{expectedCommit:commit,expectedConfigId:configId,expectedProgramId:approved.program_id});
    } catch (error) { rmSync(v.directory,{recursive:true,force:true}); throw error; }
    console.log(JSON.stringify(manifest,null,2));
  } else if (positionals[0] === 'verify') {
    if (run('git',['status','--porcelain']).trim() || run('git',['rev-parse','HEAD']).trim() !== v['expected-commit']) throw Error('VERIFICATION_REQUIRES_TRUSTED_CLEAN_CHECKOUT');
    const manifest = verifyPowRelease(v.directory,{expectedCommit:v['expected-commit'],expectedConfigId:v['expected-config-id'],expectedProgramId:approved.program_id});
    const runtime = inspectImage(manifest.image_id,manifest.source_commit);
    if (runtime.verifier_sha256 !== manifest.verifier_sha256 || runtime.node !== manifest.node) throw Error('LOADED_IMAGE_RUNTIME_MISMATCH');
    console.log(JSON.stringify({verified:true,...manifest}));
  } else throw Error('UNKNOWN_RELEASE_COMMAND');
} catch (error) {
  console.error(JSON.stringify({error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'POW_RELEASE_FAILED',production_ready:false}));
  process.exitCode = 1;
}
