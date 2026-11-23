import{join}from'node:path';import{existsSync}from'node:fs';import{readRestrictedFile}from'../operational-security/access.mjs';
export function renderBackupMetrics(directory,{now=Date.now(),profile='default'}={}){
 if(typeof profile!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(profile))throw Error('INVALID_BACKUP_METRICS_PROFILE');
 let status,pending,valid=0,pendingValid=1;
 try{status=JSON.parse(readRestrictedFile(join(directory,'last-success.json')));if(status.schema!=='AEGIS_BACKUP_JOB_V2'||!Number.isSafeInteger(status.completed_at)||status.completed_at<0||!Number.isSafeInteger(status.snapshot_created_at)||status.snapshot_created_at<0||!(/^[0-9a-f]{64}$/).test(status.source_id)||!(/^[0-9a-f]{64}$/).test(status.target_id))throw Error();valid=1;}catch{}
 if(existsSync(join(directory,'pending-upload.json')))try{pending=JSON.parse(readRestrictedFile(join(directory,'pending-upload.json')));if(pending.schema!=='AEGIS_PENDING_UPLOAD_V1'||!Number.isSafeInteger(pending.created_at)||pending.created_at<0)throw Error();}catch{pendingValid=0;}
 const metrics={aegis_backup_status_valid:valid,aegis_backup_pending_state_valid:pendingValid,aegis_backup_last_upload_timestamp_seconds:valid?status.completed_at/1000:0,
  aegis_backup_snapshot_timestamp_seconds:valid?status.snapshot_created_at/1000:0,aegis_backup_snapshot_age_seconds:valid?Math.max(0,now-status.snapshot_created_at)/1000:0,
  aegis_backup_external_copy_completed:valid&&status.external_copy_completed===true&&status.external_transport_used===true?1:0,
  aegis_backup_pending_upload:pending||!pendingValid?1:0,aegis_backup_pending_age_seconds:pendingValid&&pending?Math.max(0,now-pending.created_at)/1000:0};
 return Object.entries(metrics).map(([k,v])=>`${k}{profile="${profile}"} ${v}`).join('\n')+'\n';
}
