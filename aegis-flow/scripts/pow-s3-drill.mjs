import{parseArgs}from'node:util';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';
import{S3BackupTarget}from'../services/recovery/s3.mjs';import{runPowS3Drill}from'../services/open-chain/s3-drill.mjs';
const options=Object.fromEntries(['genesis','directory','backup-directory','output-directory','key-file','minimum-work','s3-config','source-commit'].map(n=>[n,{type:'string'}]));
const{values:v}=parseArgs({options});for(const n of Object.keys(options).filter(n=>n!=='source-commit'))if(!v[n])throw Error('REQUIRED_OPTION:'+n);
const json=p=>JSON.parse(readFileSync(p,'utf8'));let commit=v['source-commit'];if(!commit){try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{commit=null;}}
const result=await runPowS3Drill({chainDirectory:v.directory,config:json(v.genesis),backupDirectory:v['backup-directory'],outputDirectory:v['output-directory'],keyFile:v['key-file'],minimumWork:v['minimum-work'],target:new S3BackupTarget(json(v['s3-config'])),sourceCommit:commit});
console.log(JSON.stringify(result,null,2));if(result.report.outcome!=='VERIFIED')process.exitCode=1;
