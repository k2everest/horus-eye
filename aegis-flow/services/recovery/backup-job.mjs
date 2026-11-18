import crypto from'node:crypto';import{mkdirSync,writeFileSync,renameSync,unlinkSync,existsSync,openSync,closeSync,fsyncSync}from'node:fs';import{join,resolve}from'node:path';
import{canonicalSerialize}from'../../libs/crypto-core/canonical-transcript.mjs';import{readRestrictedFile}from'../operational-security/access.mjs';import{acquireProfileLock}from'../operational-security/profile-lock.mjs';
const hash=value=>crypto.createHash('sha256').update(canonicalSerialize(value)).digest('hex');
function sync(path){const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}}
function save(path,value){const temp=path+'.'+crypto.randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});sync(temp);renameSync(temp,path);sync(resolve(path,'..'));}finally{if(existsSync(temp))unlinkSync(temp);}}
function pendingState(value,sourceId,targetId,expectedKeyId){
 if(!value||Object.keys(value).sort().join(',')!=='backup_id,created_at,encryption_key_id,schema,source_id,target_id'||value.schema!=='AEGIS_PENDING_UPLOAD_V1'||typeof value.backup_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.backup_id)||!Number.isSafeInteger(value.created_at)||value.created_at<0)throw Error('INVALID_PENDING_BACKUP_STATE');
 if(value.encryption_key_id!==expectedKeyId)throw Error('PENDING_BACKUP_ENCRYPTION_KEY_CHANGED');
 if(value.source_id!==sourceId||value.target_id!==targetId)throw Error('PENDING_BACKUP_SOURCE_OR_TARGET_CHANGED');return value;
}
export async function runBackupJob({directory,sourceId,expectedKeyId,target,createArchive,now=Date.now}){
 if(typeof sourceId!=='string'||!/^[0-9a-f]{64}$/.test(sourceId))throw Error('INVALID_BACKUP_SOURCE_ID');
 if(typeof expectedKeyId!=='string'||!/^[0-9a-f]{64}$/.test(expectedKeyId))throw Error('BACKUP_ENCRYPTION_KEY_ID_REQUIRED');
 mkdirSync(directory,{recursive:true,mode:0o700});const release=await acquireProfileLock(join(directory,'backup.lock')),pendingPath=join(directory,'pending-upload.json'),targetId=hash(target.config),started=now();
 try{
  let pending,resumed=false,manifest;
  if(existsSync(pendingPath)){
   pending=pendingState(JSON.parse(readRestrictedFile(pendingPath)),sourceId,targetId,expectedKeyId);resumed=true;
   manifest=JSON.parse(readRestrictedFile(join(directory,pending.backup_id,'manifest.json')));
  }else{
   const archive=await createArchive();manifest=archive.manifest;
   pending={schema:'AEGIS_PENDING_UPLOAD_V1',backup_id:manifest.context?.backup_id,created_at:now(),source_id:sourceId,target_id:targetId,encryption_key_id:manifest.context?.key_id};pendingState(pending,sourceId,targetId,expectedKeyId);
   if(resolve(archive.directory)!==resolve(directory,pending.backup_id))throw Error('BACKUP_ARCHIVE_OUTSIDE_JOB_DIRECTORY');save(pendingPath,pending);
  }
  if(manifest.context?.backup_id!==pending.backup_id||manifest.context.key_id!==expectedKeyId||!Number.isSafeInteger(manifest.context.created_at)||manifest.context.created_at<0)throw Error('PENDING_BACKUP_MANIFEST_MISMATCH');
  const receipt=await target.upload(join(directory,pending.backup_id));
  if(receipt.backup_id!==pending.backup_id||receipt.external_copy_completed!==true)throw Error('BACKUP_UPLOAD_RECEIPT_MISMATCH');
  const marker={schema:'AEGIS_BACKUP_JOB_V2',completed_at:now(),duration_ms:Math.max(0,now()-started),backup_id:pending.backup_id,snapshot_created_at:manifest.context.created_at,upload_resumed:resumed,
   source_id:sourceId,target_id:targetId,encryption_key_id:expectedKeyId,external_transport_used:target.transport==='aws-cli',external_copy_completed:target.transport==='aws-cli',commit_marker:target.lastCommit,
   ...(manifest.context.tip?{tip:manifest.context.tip}:{}),...(manifest.context.finalized?{finalized:manifest.context.finalized}:{})};
  save(join(directory,'last-success.json'),marker);unlinkSync(pendingPath);sync(directory);return marker;
 }finally{await release();}
}
export const backupSourceId=hash;
