import {acquireProfileLock} from '../services/operational-security/profile-lock.mjs';
import {createPowBackup} from '../services/open-chain/recovery.mjs';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createBackup } from '../services/recovery/backup.mjs';
import { S3BackupTarget } from '../services/recovery/s3.mjs';
const env=process.env;
const pow=Boolean(env.AEGIS_POW_GENESIS);
for(const name of [...(pow?['AEGIS_POW_GENESIS','AEGIS_POW_DIR']:['AEGIS_LEDGER_PATH','AEGIS_NETWORK_ID']),'AEGIS_BACKUP_DIRECTORY','AEGIS_BACKUP_KEY_FILE','AEGIS_S3_CONFIG']) if(!env[name]) throw new Error(`MISSING_BACKUP_CONFIGURATION:${name}`);
const started=Date.now();
// Prevent concurrent jobs; the kernel lease is released after a process crash.
const lock=join(env.AEGIS_BACKUP_DIRECTORY,'backup.lock');
mkdirSync(env.AEGIS_BACKUP_DIRECTORY,{recursive:true,mode:0o700});
const releaseLock=await acquireProfileLock(lock);
try{
 const backup=pow?await createPowBackup({chainDirectory:env.AEGIS_POW_DIR,config:JSON.parse(readFileSync(env.AEGIS_POW_GENESIS,'utf8')),outputDirectory:env.AEGIS_BACKUP_DIRECTORY,keyFile:env.AEGIS_BACKUP_KEY_FILE}):await createBackup({ledgerPath:env.AEGIS_LEDGER_PATH,networkId:env.AEGIS_NETWORK_ID,outputDirectory:env.AEGIS_BACKUP_DIRECTORY,keyFile:env.AEGIS_BACKUP_KEY_FILE});
 const receipt=await new S3BackupTarget(JSON.parse(readFileSync(env.AEGIS_S3_CONFIG,'utf8'))).upload(backup.directory);
 const marker={schema:'AEGIS_BACKUP_JOB_V1',completed_at:Date.now(),duration_ms:Date.now()-started,backup_id:receipt.backup_id,...(pow?{consensus_model:"open-proof-of-work",tip:backup.manifest.context.tip}:{finalized:backup.manifest.context.finalized}),external_copy_completed:true};
 const temporary=join(env.AEGIS_BACKUP_DIRECTORY,'last-success.json.tmp');
 writeFileSync(temporary,JSON.stringify(marker,null,2),{mode:0o600});renameSync(temporary,join(env.AEGIS_BACKUP_DIRECTORY,'last-success.json'));
 console.log(JSON.stringify({event:'external_backup_completed',...marker}));
}catch{console.error(JSON.stringify({event:'external_backup_failed',duration_ms:Date.now()-started}));process.exitCode=1;}
finally{await releaseLock();}
