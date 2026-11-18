import crypto from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {readRestrictedFile} from '../services/operational-security/access.mjs';
import {reviewLaunch,signLaunchDecision} from '../services/launch-review/review.mjs';
const[command,...args]=process.argv.slice(2),options={};
const allowed=['dossier','registry','registry-sha256','approvals','output','key-file','signer','role','decision','expires-at'];
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!allowed.includes(args[i].slice(2))||!args[i+1]||args[i+1].startsWith('--')||args[i].slice(2)in options)throw new Error('INVALID_REVIEW_ARGUMENTS');options[args[i].slice(2)]=args[i+1];}
try{
 const dossier=JSON.parse(readFileSync(options.dossier??new URL('../docs/launch/review.json',import.meta.url),'utf8'));
 let result;
 if(command==='sign'){
  if(!options['key-file']||!options.signer||!options.role||!options.output||!options['expires-at'])throw new Error('APPROVAL_CONFIGURATION_REQUIRED');
  result=signLaunchDecision({dossier,signerId:options.signer,role:options.role,decision:options.decision??'approve',expiresAt:Number(options['expires-at']),privateKey:crypto.createPrivateKey(readRestrictedFile(options['key-file']))});
  writeFileSync(options.output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({approval_file:options.output,review_digest:result.review_digest,role:result.role}));
 }else if(command==='inspect'||command==='gate'){
  let registry=[];
  if(options.registry){const bytes=readFileSync(options.registry);if(!options['registry-sha256']||crypto.createHash('sha256').update(bytes).digest('hex')!==options['registry-sha256'])throw new Error('TRUSTED_APPROVER_REGISTRY_HASH_REQUIRED');registry=JSON.parse(bytes.toString('utf8'));}
  result=reviewLaunch({dossier,registry,approvals:options.approvals?JSON.parse(readFileSync(options.approvals,'utf8')):[]});
  if(options.output)writeFileSync(options.output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(result,null,2));if(command==='gate'&&!result.release_authorized)process.exitCode=1;
 }else throw new Error('UNKNOWN_REVIEW_COMMAND');
}catch{console.error(JSON.stringify({error:'LAUNCH_REVIEW_FAILED',release_authorized:false,production_ready:false}));process.exitCode=1;}
