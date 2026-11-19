import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {parseArgs} from 'node:util';
import {setTimeout as pause} from 'node:timers/promises';
import crypto from 'node:crypto';
import {openNetworkId} from '../services/open-chain/consensus.mjs';

const {values:v}=parseArgs({options:{image:{type:'string'},genesis:{type:'string'},'expected-config-id':{type:'string'},report:{type:'string'}}});
if(!/^sha256:[0-9a-f]{64}$/.test(v.image)||!v.genesis||!v.report||!/^[0-9a-f]{64}$/.test(v['expected-config-id']))throw Error('IMMUTABLE_SMOKE_INPUTS_REQUIRED');
const bytes=readFileSync(v.genesis);if(bytes.length>1024*1024||openNetworkId(JSON.parse(bytes))!==v['expected-config-id'])throw Error('SMOKE_GENESIS_MISMATCH');
const name='aegis-smoke-'+crypto.randomUUID(),directory=mkdtempSync(join(tmpdir(),'aegis-image-smoke-'));
const genesis=join(directory,'genesis.json');writeFileSync(genesis,bytes,{mode:0o644});
const run=args=>execFileSync('docker',args,{encoding:'utf8',timeout:15000,maxBuffer:262144});
const report={schema:'AEGIS_POW_IMAGE_SMOKE_V1',image_id:v.image,config_id:v['expected-config-id'],external_network_used:false,production_ready:false};
try {
 run(['run','--detach','--name',name,'--init','--network','none','--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--memory','2g',
  '--tmpfs','/tmp:size=64m,uid=1000,gid=1000,mode=1777','--tmpfs','/data:size=64m,uid=1000,gid=1000,mode=700',
  '--mount',`type=bind,source=${genesis},target=/run/pow-genesis.json,readonly`,
  '--env','NODE_ENV=development','--env','AEGIS_MODE=demo','--env','AEGIS_POW_GENESIS=/run/pow-genesis.json','--env','AEGIS_POW_DIR=/data/pow','--env','AEGIS_POW_PEERS=[]','--env','AEGIS_BIND_HOST=127.0.0.1','--env','PORT=8090',
  '--entrypoint','node',v.image,'/app/services/open-chain/node.mjs']);
 let ready=false;
 for(let attempt=0;attempt<20;attempt++){
  try {
   const state=JSON.parse(run(['exec',name,'node','--input-type=module','-e',`const get=async p=>{const r=await fetch('http://127.0.0.1:8090'+p,{signal:AbortSignal.timeout(1000)});if(!r.ok)throw Error('NOT_READY');return r.json()};const ready=await get('/readyz');const status=await get('/chain/status');console.log(JSON.stringify({ready:ready.ready,config_id:status.config_id,height:status.tip.height}));`]));
   if(!state.ready||state.config_id!==v['expected-config-id']||state.height!==0)throw Error('SMOKE_RUNTIME_IDENTITY_MISMATCH');
   ready=true;break;
  } catch {await pause(250);}
 }
 if(!ready)throw Error('IMAGE_NODE_NOT_READY');report.node_ready=true;
 const writer=spawnSync('docker',['exec',name,'node','/app/services/open-chain/node.mjs'],{encoding:'utf8',timeout:10000,maxBuffer:262144});
 if(writer.status===0||!String(writer.stderr).includes('PROFILE_ALREADY_IN_USE'))throw Error('IMAGE_PROFILE_EXCLUSION_FAILED');report.second_writer_rejected=true;
 const verifier=spawnSync('docker',['exec',name,'/opt/aegis/verify-stark','/tmp/missing-receipt','/tmp/missing-statement',JSON.parse(bytes).program_id],{encoding:'utf8',timeout:10000,maxBuffer:262144});
 if(verifier.status!==1||!String(verifier.stderr).includes('STARK_VERIFICATION_FAILED'))throw Error('IMAGE_VERIFIER_EXECUTION_FAILED');report.verifier_rejected_missing_input=true;
 run(['stop','--time','5',name]);
 if(run(['inspect','--format','{{.State.ExitCode}}',name]).trim()!=='0')throw Error('IMAGE_GRACEFUL_SHUTDOWN_FAILED');
 report.graceful_shutdown=true;report.outcome='VERIFIED';
 writeFileSync(resolve(v.report),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
} catch(error) {
 const logs=spawnSync('docker',['logs','--tail','80',name],{encoding:'utf8',timeout:15000,maxBuffer:262144});
 if(logs.stdout)process.stderr.write(logs.stdout);if(logs.stderr)process.stderr.write(logs.stderr);
 throw error;
} finally {
 spawnSync('docker',['rm','--force',name],{encoding:'utf8',timeout:15000,stdio:'ignore'});
 rmSync(directory,{recursive:true,force:true});
}
