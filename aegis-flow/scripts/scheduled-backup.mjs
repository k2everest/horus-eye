import{readFileSync}from'node:fs';import{resolve}from'node:path';
import{readBearerSecret}from'../services/operational-security/access.mjs';
import{createPowBackup,powBackupKeyId}from'../services/open-chain/recovery.mjs';import{createBackup,backupKeyId}from'../services/recovery/backup.mjs';
import{S3BackupTarget}from'../services/recovery/s3.mjs';import{runBackupJob,backupSourceId}from'../services/recovery/backup-job.mjs';import{openNetworkId}from'../services/open-chain/consensus.mjs';
const env=process.env,pow=Boolean(env.AEGIS_POW_GENESIS);
for(const name of [...(pow?['AEGIS_POW_GENESIS','AEGIS_POW_DIR']:['AEGIS_LEDGER_PATH','AEGIS_NETWORK_ID']),'AEGIS_BACKUP_DIRECTORY','AEGIS_BACKUP_KEY_FILE','AEGIS_S3_CONFIG'])if(!env[name])throw Error('MISSING_BACKUP_CONFIGURATION:'+name);
const started=Date.now();try{
 const config=pow?JSON.parse(readFileSync(env.AEGIS_POW_GENESIS,'utf8')):null;
 const sourceId=backupSourceId(pow?{model:'open-pow-v2',config_id:openNetworkId(config),directory:resolve(env.AEGIS_POW_DIR)}:{model:'permissioned',network_id:env.AEGIS_NETWORK_ID,ledger:resolve(env.AEGIS_LEDGER_PATH)});
 const target=new S3BackupTarget(JSON.parse(readFileSync(env.AEGIS_S3_CONFIG,'utf8')));
 const key=Buffer.from(readBearerSecret(env.AEGIS_BACKUP_KEY_FILE),'hex');let expectedKeyId;try{expectedKeyId=(pow?powBackupKeyId:backupKeyId)(key);}finally{key.fill(0);}
 const result=await runBackupJob({directory:env.AEGIS_BACKUP_DIRECTORY,sourceId,expectedKeyId,target,createArchive:()=>pow?createPowBackup({chainDirectory:env.AEGIS_POW_DIR,config,outputDirectory:env.AEGIS_BACKUP_DIRECTORY,keyFile:env.AEGIS_BACKUP_KEY_FILE}):createBackup({ledgerPath:env.AEGIS_LEDGER_PATH,networkId:env.AEGIS_NETWORK_ID,outputDirectory:env.AEGIS_BACKUP_DIRECTORY,keyFile:env.AEGIS_BACKUP_KEY_FILE})});
 console.log(JSON.stringify({event:'external_backup_completed',...result}));
}catch(error){console.error(JSON.stringify({event:'external_backup_failed',duration_ms:Date.now()-started,code:/^[A-Z0-9_]+$/.test(error.message)?error.message:'BACKUP_JOB_FAILED'}));process.exitCode=1;}
