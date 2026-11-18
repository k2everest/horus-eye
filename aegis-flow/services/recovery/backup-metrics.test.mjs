import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{renderBackupMetrics}from'./backup-metrics.mjs';
test('metrics distinguish a recent upload from an old snapshot and do not certify test transport',t=>{
 const root=mkdtempSync(join(tmpdir(),'backup-metrics-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 writeFileSync(join(root,'last-success.json'),JSON.stringify({schema:'AEGIS_BACKUP_JOB_V2',completed_at:900000,snapshot_created_at:1000,source_id:'42'.repeat(32),target_id:'43'.repeat(32),external_copy_completed:true,external_transport_used:false}),{mode:0o600});
 writeFileSync(join(root,'pending-upload.json'),JSON.stringify({schema:'AEGIS_PENDING_UPLOAD_V1',created_at:500000}),{mode:0o600});
 const text=renderBackupMetrics(root,{now:1000000});assert.match(text,/aegis_backup_status_valid.* 1/);assert.match(text,/aegis_backup_snapshot_age_seconds.* 999/);assert.match(text,/aegis_backup_last_upload_timestamp_seconds.* 900/);assert.match(text,/aegis_backup_external_copy_completed.* 0/);assert.match(text,/aegis_backup_pending_age_seconds.* 500/);
});
test('missing or malformed status is observable instead of appearing healthy',t=>{
 const root=mkdtempSync(join(tmpdir(),'backup-metrics-bad-'));t.after(()=>rmSync(root,{recursive:true,force:true}));assert.match(renderBackupMetrics(root),/aegis_backup_status_valid.* 0/);
 writeFileSync(join(root,'last-success.json'),'not json',{mode:0o600});writeFileSync(join(root,'pending-upload.json'),'invalid',{mode:0o600});const text=renderBackupMetrics(root);assert.match(text,/aegis_backup_status_valid.* 0/);assert.match(text,/aegis_backup_pending_state_valid.* 0/);
});
