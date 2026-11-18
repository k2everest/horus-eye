import {assertFreeSpace} from './disk-space.mjs';
import crypto from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync,chmodSync,renameSync,lstatSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileDigest} from './backup.mjs';
import {runAwsJson} from './aws-cli.mjs';
const MAX_OBJECT_BYTES=1024*1024*1024,MAX_RECEIPT_BYTES=65536;
const digest=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const version=s=>typeof s==='string'&&s!=='null'&&s.length>0&&s.length<=1024&&!/[\r\n]/.test(s);
function fileSize(path,max){const s=lstatSync(path);if(!s.isFile()||s.size<1||s.size>max)throw Error('S3_LOCAL_FILE_SIZE_OR_TYPE_INVALID');return s.size;}
function readJson(path,max=MAX_RECEIPT_BYTES){fileSize(path,max);return JSON.parse(readFileSync(path,'utf8'));}
export function assertS3Config(c){
 if(!c||Object.keys(c).sort().join(',')!=='bucket,expected_bucket_owner,kms_key_arn,prefix,region,schema'||c.schema!=='AEGIS_S3_BACKUP_TARGET_V1'||typeof c.bucket!=='string'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.bucket)||/\.\.|^\d+\.\d+\.\d+\.\d+$/.test(c.bucket)||typeof c.region!=='string'||!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(c.region)||typeof c.expected_bucket_owner!=='string'||!/^\d{12}$/.test(c.expected_bucket_owner)||typeof c.prefix!=='string'||c.prefix.length>128||!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(c.prefix)||typeof c.kms_key_arn!=='string'||!new RegExp(`^arn:aws(?:-us-gov|-cn)?:kms:${c.region}:${c.expected_bucket_owner}:key/[A-Za-z0-9-]{1,128}$`).test(c.kms_key_arn))throw Error('INVALID_S3_BACKUP_TARGET');
 return c;
}
export class S3BackupTarget {
 #config;#run;#commit;
 constructor(config,{runner=runAwsJson}={}){this.#config=structuredClone(assertS3Config(config));this.#run=runner;}
 get config(){return structuredClone(this.#config);}
 get transport(){return this.#run===runAwsJson?'aws-cli':'injected-runner';}
 get lastCommit(){return this.#commit?{...this.#commit}:undefined;}
 #call(operation,args=[]){return this.#run(['s3api',operation,'--bucket',this.#config.bucket,'--expected-bucket-owner',this.#config.expected_bucket_owner,'--region',this.#config.region,'--output','json',...args]);}
 async #preflight(){
  const v=await this.#call('get-bucket-versioning'),a=await this.#call('get-public-access-block');
  if(v.Status!=='Enabled'||!['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(k=>a.PublicAccessBlockConfiguration?.[k]===true))throw Error('S3_REQUIRES_VERSIONING_AND_PUBLIC_ACCESS_BLOCK');
 }
 #prefix(id){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))throw Error('INVALID_BACKUP_ID');return `${this.#config.prefix}/${id}`;}
 async #head(key,pinnedVersion){
  try{return await this.#call('head-object',['--key',key,'--checksum-mode','ENABLED',...(pinnedVersion?['--version-id',pinnedVersion]:[])]);}
  catch(e){if(e.message==='AWS_OBJECT_NOT_FOUND')return undefined;throw e;}
 }
 #checkHead(head,{sha256,size,max=MAX_OBJECT_BYTES,pinnedVersion}={}){
  const checksum=head?.ChecksumSHA256,bytes=typeof checksum==='string'?Buffer.from(checksum,'base64'):Buffer.alloc(0);
  if(!head||!version(head.VersionId)||pinnedVersion&&head.VersionId!==pinnedVersion||head.ServerSideEncryption!=='aws:kms'||head.SSEKMSKeyId!==this.#config.kms_key_arn||!Number.isSafeInteger(head.ContentLength)||head.ContentLength<1||head.ContentLength>max||size!==undefined&&head.ContentLength!==size||bytes.length!==32||bytes.toString('base64')!==checksum||sha256&&bytes.toString('hex')!==sha256)throw Error('S3_REMOTE_OBJECT_CONFLICT');
  return{version_id:head.VersionId,sha256:bytes.toString('hex')};
 }
 #receipt(receipt,id){
  const prefix=this.#prefix(id);
  if(!receipt||Object.keys(receipt).sort().join(',')!=='backup_id,bucket,external_copy_completed,objects,schema'||receipt.schema!=='AEGIS_S3_BACKUP_RECEIPT_V1'||receipt.backup_id!==id||receipt.bucket!==this.#config.bucket||receipt.external_copy_completed!==true||!Array.isArray(receipt.objects)||receipt.objects.length!==2)throw Error('S3_VERSION_RECEIPT_REQUIRED');
  const expected=['manifest.json','ledger.enc'].map(n=>`${prefix}/${n}`);
  if(new Set(receipt.objects.map(o=>o?.key)).size!==2||receipt.objects.some(o=>!o||Object.keys(o).sort().join(',')!=='key,sha256,version_id'||!expected.includes(o.key)||!version(o.version_id)||!digest(o.sha256)))throw Error('INVALID_S3_VERSION_RECEIPT');
  return receipt;
 }
 async #downloadFile(key,head,path,max){
  this.#checkHead(head,{max});assertFreeSpace(dirname(path),head.ContentLength);writeFileSync(path,'',{flag:'wx',mode:0o600});
  const result=await this.#call('get-object',['--key',key,'--version-id',head.VersionId,'--checksum-mode','ENABLED','--range',`bytes=0-${max}`,path]);chmodSync(path,0o600);
  if(result.VersionId&&result.VersionId!==head.VersionId)throw Error('S3_DOWNLOADED_VERSION_MISMATCH');
  if(fileSize(path,max)!==head.ContentLength||await fileDigest(path)!==Buffer.from(head.ChecksumSHA256,'base64').toString('hex'))throw Error('S3_DOWNLOAD_CHECKSUM_MISMATCH');
 }
 async #remoteReceipt(id,directory,{uploadProbe=false}={}){
  const key=`${this.#prefix(id)}/s3-receipt.json`,head=await this.#head(key).catch(e=>{if(uploadProbe&&e.message==='AWS_ACCESS_DENIED')return undefined;throw e;});if(!head)return undefined;
  this.#checkHead(head,{max:MAX_RECEIPT_BYTES});const temp=join(directory,`.s3-receipt.remote-${crypto.randomUUID()}.json`);
  try{await this.#downloadFile(key,head,temp,MAX_RECEIPT_BYTES);const receipt=this.#receipt(readJson(temp),id);this.#commit={key,version_id:head.VersionId,sha256:Buffer.from(head.ChecksumSHA256,'base64').toString('hex')};return receipt;}
  finally{rmSync(temp,{force:true});}
 }
 #saveReceipt(directory,receipt){const temp=join(directory,`.s3-receipt-${crypto.randomUUID()}.json`);try{writeFileSync(temp,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});renameSync(temp,join(directory,'s3-receipt.json'));}finally{rmSync(temp,{force:true});}}
 async #putImmutable(key,filename,max=MAX_OBJECT_BYTES){
  const size=fileSize(filename,max),sha256=await fileDigest(filename);let result;
  try{result=await this.#call('put-object',['--key',key,'--body',filename,'--if-none-match','*','--checksum-algorithm','SHA256','--checksum-sha256',Buffer.from(sha256,'hex').toString('base64'),'--server-side-encryption','aws:kms','--ssekms-key-id',this.#config.kms_key_arn]);}
  catch(error){let head;try{head=await this.#head(key);}catch(readError){if(readError.message==='AWS_ACCESS_DENIED'&&error.message!=='AWS_PRECONDITION_FAILED')throw error;throw readError;}if(!head)throw error;return{key,...this.#checkHead(head,{sha256,size,max})};}
  if(!version(result?.VersionId)||result.ChecksumSHA256!==Buffer.from(sha256,'hex').toString('base64')||result.ServerSideEncryption!=='aws:kms'||result.SSEKMSKeyId!==this.#config.kms_key_arn)throw Error('S3_UPLOAD_ACKNOWLEDGEMENT_INVALID');
  return{key,version_id:result.VersionId,sha256};
 }
 async upload(directory){
  this.#commit=undefined;const manifest=readJson(join(directory,'manifest.json')),id=manifest.context?.backup_id,prefix=this.#prefix(id);
  fileSize(join(directory,'ledger.enc'),MAX_OBJECT_BYTES);
  if(await fileDigest(join(directory,'ledger.enc'))!==manifest.ciphertext_sha256)throw Error('BACKUP_UPLOAD_CHECKSUM_MISMATCH');
  await this.#preflight();
  const previous=await this.#remoteReceipt(id,directory,{uploadProbe:true});
  if(previous){for(const name of ['ledger.enc','manifest.json']){const object=previous.objects.find(o=>o.key===`${prefix}/${name}`),filename=join(directory,name),max=name==='manifest.json'?MAX_RECEIPT_BYTES:MAX_OBJECT_BYTES;
    const sha256=await fileDigest(filename);if(sha256!==object.sha256)throw Error('S3_REMOTE_OBJECT_CONFLICT');
    this.#checkHead(await this.#head(object.key,object.version_id),{sha256,size:fileSize(filename,max),max,pinnedVersion:object.version_id});
   }this.#saveReceipt(directory,previous);return previous;}
  const objects=[];for(const name of ['ledger.enc','manifest.json'])objects.push(await this.#putImmutable(`${prefix}/${name}`,join(directory,name),name==='manifest.json'?MAX_RECEIPT_BYTES:MAX_OBJECT_BYTES));
  const receipt={schema:'AEGIS_S3_BACKUP_RECEIPT_V1',backup_id:id,bucket:this.#config.bucket,objects,external_copy_completed:true};
  const temp=join(directory,`.s3-receipt.pending-${crypto.randomUUID()}.json`);
  try{writeFileSync(temp,JSON.stringify(receipt,null,2),{flag:'wx',mode:0o600});this.#commit=await this.#putImmutable(`${prefix}/s3-receipt.json`,temp,MAX_RECEIPT_BYTES);this.#saveReceipt(directory,receipt);}
  finally{rmSync(temp,{force:true});}return receipt;
 }
 async download({backupId,destinationDirectory,receipt}){
  this.#prefix(backupId);if(existsSync(destinationDirectory))throw Error('BACKUP_DOWNLOAD_DESTINATION_EXISTS');mkdirSync(dirname(destinationDirectory),{recursive:true,mode:0o700});mkdirSync(destinationDirectory,{mode:0o700});
  try{
   receipt=this.#receipt(receipt??await this.#remoteReceipt(backupId,destinationDirectory),backupId);
   for(const name of ['manifest.json','ledger.enc']){const object=receipt.objects.find(o=>o.key===`${this.#prefix(backupId)}/${name}`),max=name==='manifest.json'?MAX_RECEIPT_BYTES:MAX_OBJECT_BYTES;
    const head=await this.#head(object.key,object.version_id);this.#checkHead(head,{sha256:object.sha256,max,pinnedVersion:object.version_id});await this.#downloadFile(object.key,head,join(destinationDirectory,name),max);
   }this.#saveReceipt(destinationDirectory,receipt);return{directory:destinationDirectory,downloaded:true};
  }catch(error){rmSync(destinationDirectory,{recursive:true,force:true});throw error;}
 }
}
