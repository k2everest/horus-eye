import {parseArgs} from 'node:util';import {readFileSync,writeFileSync} from 'node:fs';import crypto from 'node:crypto';
import {createPowBackup,restorePowBackup} from '../services/open-chain/recovery.mjs';
import {S3BackupTarget} from '../services/recovery/s3.mjs';
const{positionals,values:v}=parseArgs({allowPositionals:true,options:Object.fromEntries(['genesis','directory','backup-directory','key-file','destination','minimum-work','s3-config','backup-id','receipt'].map(n=>[n,{type:'string'}]))});
const required=names=>{if(names.some(n=>!v[n]))throw Error('REQUIRED_OPTIONS:'+names.join(','));};const json=p=>JSON.parse(readFileSync(p,'utf8'));let result;
switch(positionals[0]){
 case'create-key':required(['key-file']);writeFileSync(v['key-file'],crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});result={created:true,key_file:v['key-file']};break;
 case'backup':required(['genesis','directory','backup-directory','key-file']);result=await createPowBackup({chainDirectory:v.directory,config:json(v.genesis),outputDirectory:v['backup-directory'],keyFile:v['key-file']});if(v['s3-config'])result.external_receipt=await new S3BackupTarget(json(v['s3-config'])).upload(result.directory);break;
 case'restore':required(['genesis','backup-directory','destination','key-file','minimum-work']);result=await restorePowBackup({backupDirectory:v['backup-directory'],destinationDirectory:v.destination,config:json(v.genesis),keyFile:v['key-file'],minimumWork:v['minimum-work']});break;
 case'upload':required(['backup-directory','s3-config']);result=await new S3BackupTarget(json(v['s3-config'])).upload(v['backup-directory']);break;
 case'download':required(['backup-id','destination','s3-config']);result=await new S3BackupTarget(json(v['s3-config'])).download({backupId:v['backup-id'],destinationDirectory:v.destination,receipt:v.receipt?json(v.receipt):undefined});break;
 default:throw Error('Usage: pow-recovery.mjs create-key|backup|restore|upload|download --OPTION VALUE ...');
}
console.log(JSON.stringify(result,null,2));
