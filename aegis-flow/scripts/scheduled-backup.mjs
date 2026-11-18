import { readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createBackup } from '../services/recovery/backup.mjs';
import { S3BackupTarget } from '../services/recovery/s3.mjs';
const env=process.env;
for(const name of ['AEGIS_LEDGER_PATH','AEGIS_NETWORK_ID','AEGIS_BACKUP_DIRECTORY','AEGIS_BACKUP_KEY_FILE','AEGIS_S3_CONFIG']) if(!env[name]) throw new Error(`MISSING_BACKUP_CONFIGURATION:${name}`);
const started=Date.now();
// Prevent two jobs consuming space/uploading simultaneously; a stale lock needs
// operator verification after a process crash, never unsafe automatic deletion.
const lock=join(env.AEGIS_BACKUP_DIRECTORY,'backup.lock');
const fd=openSync(lock,'wx',0o600);writeFileSync(fd,String(process.pid));closeSync(fd);
try{
 const backup=await createBackup({ledgerPath:env.AEGIS_LEDGER_PATH,networkId:env.AEGIS_NETWORK_ID,outputDirectory:env.AEGIS_BACKUP_DIRECTORY,keyFile:env.AEGIS_BACKUP_KEY_FILE});
 const receipt=await new S3BackupTarget(JSON.parse(readFileSync(env.AEGIS_S3_CONFIG,'utf8'))).upload(backup.directory);
 const marker={schema:'AEGIS_BACKUP_JOB_V1',completed_at:Date.now(),duration_ms:Date.now()-started,backup_id:receipt.backup_id,finalized:backup.manifest.context.finalized,external_copy_completed:true};
 const temporary=join(env.AEGIS_BACKUP_DIRECTORY,'last-success.json.tmp');
 writeFileSync(temporary,JSON.stringify(marker,null,2),{mode:0o600});renameSync(temporary,join(env.AEGIS_BACKUP_DIRECTORY,'last-success.json'));
 console.log(JSON.stringify({event:'external_backup_completed',...marker}));
}catch{console.error(JSON.stringify({event:'external_backup_failed',duration_ms:Date.now()-started}));process.exitCode=1;}
finally{unlinkSync(lock);}
