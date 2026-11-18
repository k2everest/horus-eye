import {assertFreeSpace} from '../recovery/disk-space.mjs';
import crypto from 'node:crypto';
import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,mkdtempSync,writeFileSync,createReadStream,createWriteStream,unlinkSync,rmSync,existsSync,statSync,linkSync,rmdirSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import {OpenChain} from './chain.mjs';
import {openNetworkId} from './consensus.mjs';
import {readBearerSecret,readRestrictedFile} from '../operational-security/access.mjs';
import {fileDigest} from '../recovery/backup.mjs';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';

const MAX_BYTES=1024*1024*1024;
export const powBackupKeyId=key=>crypto.createHash('sha256').update('AEGIS_POW_BACKUP_KEY_V2\0').update(key).digest('hex');
const sync=path=>{const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.split(',').sort().join(',');
const hex=(s,n=64)=>typeof s==='string'&&new RegExp(`^[0-9a-f]{${n}}$`).test(s);
function assertManifest(m){const c=m?.context;
 if(!exact(m,'context,nonce,tag,ciphertext_sha256')||!exact(c,'schema,backup_id,created_at,config_id,key_id,tip,scope')||c.schema!=='AEGIS_OPEN_POW_BACKUP_V2'||c.scope!=='verified-pow-branches'||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(c.backup_id)||!Number.isSafeInteger(c.created_at)||c.created_at<0||![c.config_id,c.key_id,m.ciphertext_sha256].every(v=>hex(v))||!hex(m.nonce,24)||!hex(m.tag,32)||
  !exact(c.tip,'height,hash,work')||!Number.isSafeInteger(c.tip.height)||c.tip.height<0||!hex(c.tip.hash)||typeof c.tip.work!=='string'||!/^(0|[1-9][0-9]{0,127})$/.test(c.tip.work))throw Error('INVALID_POW_BACKUP_MANIFEST');
}
export async function createPowBackup({chainDirectory,config,outputDirectory,keyFile,backend,limits}){
 mkdirSync(outputDirectory,{recursive:true,mode:0o700});
 const sourceFile=join(chainDirectory,'chain.sqlite');const sourceBytes=statSync(sourceFile,{bigint:true}).size+(existsSync(sourceFile+'-wal')?statSync(sourceFile+'-wal',{bigint:true}).size:0n);
 assertFreeSpace(outputDirectory,sourceBytes*2n);
 const key=Buffer.from(readBearerSecret(keyFile),'hex');
 const destination=join(outputDirectory,crypto.randomUUID());mkdirSync(destination,{mode:0o700});let db,verified;
 const plain=join(destination,'chain.sqlite');
 try{
  db=new DatabaseSync(join(chainDirectory,'chain.sqlite'),{readOnly:true});await backup(db,plain);db.close();db=undefined;
  if(statSync(plain).size>MAX_BYTES)throw Error('POW_BACKUP_SIZE_LIMIT');
  verified=await OpenChain.open({directory:destination,config,backend,limits});const tip=verified.tip;verified.close();verified=undefined;
  const context={schema:'AEGIS_OPEN_POW_BACKUP_V2',backup_id:destination.split('/').at(-1),created_at:Date.now(),config_id:openNetworkId(config),key_id:powBackupKeyId(key),tip:{height:tip.height,hash:tip.hash,work:tip.work},scope:'verified-pow-branches'};
  const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(canonicalSerialize(context)));
  const encrypted=join(destination,'ledger.enc');await pipeline(createReadStream(plain),cipher,createWriteStream(encrypted,{flags:'wx',mode:0o600}));
  const manifest={context,nonce:nonce.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext_sha256:await fileDigest(encrypted)};
  sync(encrypted);writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});sync(join(destination,'manifest.json'));unlinkSync(plain);sync(destination);
  return{directory:resolve(destination),manifest,external_copy_completed:false};
 }catch(e){verified?.close();db?.close();rmSync(destination,{recursive:true,force:true});throw e;}finally{key.fill(0);}
}
export async function restorePowBackup({backupDirectory,destinationDirectory,config,keyFile,minimumWork,backend,limits}){
 if(typeof minimumWork!=='string'||!/^(0|[1-9][0-9]{0,127})$/.test(minimumWork))throw Error('INDEPENDENT_POW_WORK_FLOOR_REQUIRED');
 if(existsSync(destinationDirectory))throw Error('RESTORE_DESTINATION_EXISTS');
 const manifest=JSON.parse(readRestrictedFile(join(backupDirectory,'manifest.json'),65536));assertManifest(manifest);
 if(manifest.context.config_id!==openNetworkId(config))throw Error('POW_RECOVERY_CONFIG_MISMATCH');
 const encrypted=join(backupDirectory,'ledger.enc');if(statSync(encrypted).size>MAX_BYTES)throw Error('POW_BACKUP_SIZE_LIMIT');
 mkdirSync(dirname(resolve(destinationDirectory)),{recursive:true,mode:0o700});assertFreeSpace(dirname(resolve(destinationDirectory)),statSync(encrypted).size);
 const staging=mkdtempSync(join(dirname(resolve(destinationDirectory)),'.pow-restore-'));let verified,key,published=false,success=false;
 try{
  key=Buffer.from(readBearerSecret(keyFile),'hex');
  if(powBackupKeyId(key)!==manifest.context.key_id||await fileDigest(encrypted)!==manifest.ciphertext_sha256)throw Error('POW_BACKUP_KEY_OR_CHECKSUM_MISMATCH');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(manifest.nonce,'hex'));decipher.setAAD(Buffer.from(canonicalSerialize(manifest.context)));decipher.setAuthTag(Buffer.from(manifest.tag,'hex'));
  const plain=join(staging,'chain.sqlite');try{await pipeline(createReadStream(encrypted),decipher,createWriteStream(plain,{flags:'wx',mode:0o600}));}catch{throw Error('POW_BACKUP_AUTHENTICATION_FAILED');}
  verified=await OpenChain.open({directory:staging,config,backend,limits});const tip=verified.tip;
  if(tip.hash!==manifest.context.tip.hash||tip.work!==manifest.context.tip.work||tip.height!==manifest.context.tip.height)throw Error('POW_BACKUP_STATE_MISMATCH');
  if(BigInt(tip.work)<BigInt(minimumWork))throw Error('POW_RECOVERY_BELOW_VERIFIED_WORK');
  verified.close();verified=undefined;sync(plain);
  mkdirSync(destinationDirectory,{mode:0o700});published=true;linkSync(plain,join(destinationDirectory,'chain.sqlite'));sync(destinationDirectory);sync(dirname(resolve(destinationDirectory)));success=true;
  return{restored:true,destination:resolve(destinationDirectory),tip,config_id:openNetworkId(config),finality:'probabilistic',production_ready:false};
 }finally{
  verified?.close();key?.fill(0);rmSync(staging,{recursive:true,force:true});
  if(published&&!success){try{unlinkSync(join(destinationDirectory,'chain.sqlite'));}catch{}try{rmdirSync(destinationDirectory);}catch{}}
 }
}
