import crypto from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createPrivateKey} from 'node:crypto';
import {readRestrictedFile} from '../services/operational-security/access.mjs';
import {EvidenceJournal,assertCampaign} from '../services/testnet/evidence.mjs';
import {PairedWalletAgent,runFreshTransfers,runReplayLoad,observeGateway} from '../services/testnet/runners.mjs';
import {assessCampaign,signTestnetReport} from '../services/testnet/assessment.mjs';
const[command,...args]=process.argv.slice(2);const options={};
const allowed=['campaign','config','directory','observer','token-file','wallet-origin','count','interval-ms','duration-ms','corpus','budget','journals','registry','reports','input','key-file','output'];
for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!allowed.includes(args[i].slice(2))||!args[i+1]||args[i+1].startsWith('--')||args[i].slice(2)in options)throw new Error('INVALID_TESTNET_ARGUMENTS');options[args[i].slice(2)]=args[i+1];}
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const requireOptions=names=>{if(names.some(n=>!options[n]))throw new Error('MISSING_TESTNET_CONFIGURATION');};
let journal;
try{
 let result;
 if(command==='sign-report'){
  requireOptions(['input','key-file','output']);
  result=signTestnetReport(json(options.input),createPrivateKey(readRestrictedFile(options['key-file'])));
  writeFileSync(options.output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({signed_report:options.output}));
 }else{
  requireOptions(['campaign','config']);const campaign=assertCampaign(json(options.campaign));const config=json(options.config);
  if(command==='assess'||command==='gate'){
   requireOptions(['journals']);
   result=await assessCampaign({campaign,config,journalPaths:json(options.journals),registry:options.registry?json(options.registry):[],reports:options.reports?json(options.reports):[]});
   if(options.output)writeFileSync(options.output,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
   console.log(JSON.stringify(result,null,2));
   if(command==='gate'&&result.p1_completed!==true)process.exitCode=1;
  }else{
   requireOptions(['directory','observer']);if(!/^[A-Za-z0-9_-]{1,64}$/.test(options.observer))throw new Error('INVALID_OBSERVER');mkdirSync(options.directory,{recursive:true,mode:0o700});
   const filename=join(options.directory,`${options.observer}-${crypto.randomUUID()}.jsonl`);
   journal=new EvidenceJournal({filename,campaign,observerId:options.observer});
   if(command==='observe')result=await observeGateway({campaign,journal,durationMs:Number(options['duration-ms']??60000),intervalMs:Number(options['interval-ms']??30000)});
   else if(command==='replay'){
    requireOptions(['corpus','token-file']);const corpus=json(options.corpus);
    result=await runReplayLoad({campaign,config,corpus:Array.isArray(corpus)?corpus:[corpus],tokenFile:options['token-file'],journal,attempts:Number(options.count??10),intervalMs:Number(options['interval-ms']??6000),budget:options.budget??'nominal'});
   }else if(command==='fresh'){
    requireOptions(['token-file']);
    const agent=new PairedWalletAgent({origin:options['wallet-origin']??'http://127.0.0.1:8765',tokenFile:options['token-file']});
    result=await runFreshTransfers({campaign,config,agent,journal,artifactDirectory:options.directory,count:Number(options.count??1),pollMs:Number(options['interval-ms']??10000)});
   }else throw new Error('UNKNOWN_TESTNET_COMMAND');
   const head=journal.close();journal=undefined;
   console.log(JSON.stringify({result,journal:filename,head,public_campaign_completed:false}));
  }
 }
}catch{
 if(journal){try{journal.append('failure',{stage:['observe','replay'].includes(command)?command:'send',code:'REJECTED'});console.error(JSON.stringify({journal_head:journal.close()}));}catch{/* Preserve original evidence; do not print sensitive errors. */}}
 console.error(JSON.stringify({error:'TESTNET_CAMPAIGN_FAILED',public_campaign_completed:false}));process.exitCode=1;
}
