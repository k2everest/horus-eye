import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';import {tmpdir}from'node:os';import{join}from'node:path';
import{S3BackupTarget}from'./s3.mjs';import{memoryS3}from'./testing/memory-s3.mjs';
const config={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'aegis-dr-test',region:'us-east-1',prefix:'aegis/ledger',expected_bucket_owner:'123456789012',kms_key_arn:'arn:aws:kms:us-east-1:123456789012:key/test-key'};
function fixture(t){const root=mkdtempSync(join(tmpdir(),'aegis-s3-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const id=crypto.randomUUID(),body=crypto.randomBytes(128);writeFileSync(join(root,'ledger.enc'),body);writeFileSync(join(root,'manifest.json'),JSON.stringify({context:{backup_id:id},ciphertext_sha256:crypto.createHash('sha256').update(body).digest('hex')}));return{root,id,body};}
test('version-pinned KMS upload/download is idempotent and preserves existing versions',async t=>{
 const{root,body,id}=fixture(t),memory=memoryS3(config),target=new S3BackupTarget(config,{runner:memory.runner});const receipt=await target.upload(root);
 assert.equal(receipt.external_copy_completed,true);assert.equal(memory.writes,3);assert.deepEqual(await target.upload(root),receipt);assert.equal(memory.writes,3);assert.equal(target.transport,'injected-runner');
 memory.seed(`${config.prefix}/${id}/ledger.enc`,Buffer.from('later unrelated version'));
 await target.download({backupId:id,destinationDirectory:join(root,'download'),receipt});assert.deepEqual(readFileSync(join(root,'download','ledger.enc')),body);
});
test('unknown upload acknowledgement resumes without replacing the committed object',async t=>{
 const{root}=fixture(t);let lost=false;const memory=memoryS3(config,{afterPut:({key})=>{if(!lost&&key.endsWith('/ledger.enc')){lost=true;throw Error('AWS_REQUEST_FAILED');}}});
 const target=new S3BackupTarget(config,{runner:memory.runner});await target.upload(root);assert.equal(memory.writes,3);await target.upload(root);assert.equal(memory.writes,3);
});
test('partial upload can be retried and stale local pending receipts do not block completion',async t=>{
 const{root}=fixture(t);let failed=false;const memory=memoryS3(config,{beforeCall:({operation,key})=>{if(!failed&&operation==='put-object'&&key.endsWith('/manifest.json')){failed=true;throw Error('AWS_REQUEST_FAILED');}}});
 const target=new S3BackupTarget(config,{runner:memory.runner});await assert.rejects(target.upload(root),/AWS_REQUEST_FAILED/);assert.equal(memory.writes,1);
 writeFileSync(join(root,'s3-receipt.pending.json'),'old interrupted attempt');await target.upload(root);assert.equal(memory.writes,3);
});
test('missing-object HEAD 403 does not require granting access to list the whole bucket',async t=>{
 const{root}=fixture(t),memory=memoryS3(config,{missingHeadDenied:true});await new S3BackupTarget(config,{runner:memory.runner}).upload(root);assert.equal(memory.writes,3);
});
test('conflicting remote objects are rejected without overwrite or deletion',async t=>{
 const{root,id}=fixture(t),memory=memoryS3(config);memory.seed(`${config.prefix}/${id}/ledger.enc`,Buffer.from('different body'));
 await assert.rejects(new S3BackupTarget(config,{runner:memory.runner}).upload(root),/REMOTE_OBJECT_CONFLICT/);assert.equal(memory.writes,1);assert.equal(memory.calls.some(c=>c[1].includes('delete')),false);
});
test('corrupted downloads and oversized commit markers fail closed and clean only the new destination',async t=>{
 const{root,id}=fixture(t),memory=memoryS3(config,{transformRead:({key,data})=>{if(key.endsWith('/ledger.enc'))data[0]^=1;return data;}});const target=new S3BackupTarget(config,{runner:memory.runner});const receipt=await target.upload(root);
 const destination=join(root,'bad');await assert.rejects(target.download({backupId:id,destinationDirectory:destination,receipt}),/CHECKSUM_MISMATCH/);assert.equal(existsSync(destination),false);
 memory.seed(`${config.prefix}/${id}/s3-receipt.json`,Buffer.alloc(65537));await assert.rejects(target.upload(root),/REMOTE_OBJECT_CONFLICT/);
});
test('S3 refuses disabled versioning and malformed target before uploading',async t=>{
 const{root}=fixture(t);assert.throws(()=>new S3BackupTarget({...config,expected_bucket_owner:'unknown'}),/INVALID_S3/);assert.throws(()=>new S3BackupTarget({...config,prefix:123}),/INVALID_S3/);
 await assert.rejects(new S3BackupTarget(config,{runner:async args=>{assert.notEqual(args[1],'put-object');return{};}}).upload(root),/VERSIONING/);
});
