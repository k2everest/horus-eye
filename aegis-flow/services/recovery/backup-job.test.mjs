import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import crypto from'node:crypto';
import{runBackupJob}from'./backup-job.mjs';import{S3BackupTarget}from'./s3.mjs';import{memoryS3}from'./testing/memory-s3.mjs';
const config={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'queer-altcoin',region:'us-east-2',expected_bucket_owner:'941554679497',prefix:'aegis/pow/v2',kms_key_arn:'arn:aws:kms:us-east-2:941554679497:key/test-key'};
function fixture(t){const root=mkdtempSync(join(tmpdir(),'backup-job-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let creations=0;
 const createArchive=async()=>{creations++;const id=crypto.randomUUID(),directory=join(root,id);mkdirSync(directory,{mode:0o700});const body=Buffer.from('encrypted fixture'),manifest={context:{backup_id:id,created_at:1000,key_id:'66'.repeat(32),tip:{height:3,work:'768'}},ciphertext_sha256:crypto.createHash('sha256').update(body).digest('hex')};writeFileSync(join(directory,'ledger.enc'),body);writeFileSync(join(directory,'manifest.json'),JSON.stringify(manifest),{mode:0o600});return{directory,manifest};};return{root,createArchive,get creations(){return creations;}};}
test('scheduled retry resumes the durable pending backup instead of creating another snapshot',async t=>{
 const f=fixture(t);let fail=true;const memory=memoryS3(config,{beforeCall:({operation,key})=>{if(fail&&operation==='put-object'&&key.endsWith('/manifest.json'))throw Error('AWS_REQUEST_FAILED');}});const target=new S3BackupTarget(config,{runner:memory.runner}),args={directory:f.root,sourceId:'42'.repeat(32),expectedKeyId:'66'.repeat(32),target,createArchive:f.createArchive};
 await assert.rejects(runBackupJob(args),/AWS_REQUEST_FAILED/);assert.equal(f.creations,1);assert.equal(existsSync(join(f.root,'pending-upload.json')),true);assert.equal(existsSync(join(f.root,'last-success.json')),false);
 fail=false;const result=await runBackupJob(args);assert.equal(f.creations,1);assert.equal(result.upload_resumed,true);assert.equal(result.snapshot_created_at,1000);assert.equal(result.external_copy_completed,false);assert.equal(memory.writes,3);assert.equal(existsSync(join(f.root,'pending-upload.json')),false);
});
test('pending source/target changes fail before moving backup data to a different destination',async t=>{
 const f=fixture(t),memory=memoryS3(config,{beforeCall:({operation})=>{if(operation==='put-object')throw Error('AWS_REQUEST_FAILED');}}),args={directory:f.root,sourceId:'42'.repeat(32),expectedKeyId:'66'.repeat(32),target:new S3BackupTarget(config,{runner:memory.runner}),createArchive:f.createArchive};
 await assert.rejects(runBackupJob(args));const before=readFileSync(join(f.root,'pending-upload.json'),'utf8');
 await assert.rejects(runBackupJob({...args,expectedKeyId:'67'.repeat(32)}),/ENCRYPTION_KEY_CHANGED/);
 await assert.rejects(runBackupJob({...args,sourceId:'43'.repeat(32)}),/SOURCE_OR_TARGET_CHANGED/);
 const other=memoryS3({...config,prefix:'different'});await assert.rejects(runBackupJob({...args,target:new S3BackupTarget({...config,prefix:'different'},{runner:other.runner})}),/SOURCE_OR_TARGET_CHANGED/);assert.equal(other.calls.length,0);assert.equal(readFileSync(join(f.root,'pending-upload.json'),'utf8'),before);
});
