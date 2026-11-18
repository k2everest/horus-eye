import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3BackupTarget } from './s3.mjs';
const config={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'aegis-dr-test',region:'us-east-1',prefix:'aegis/ledger',expected_bucket_owner:'123456789012',kms_key_arn:'arn:aws:kms:us-east-1:123456789012:key/test-key'};
test('S3 contract uses KMS, immutable objects, versions and external receipt commit; download checks hashes',async t=>{
  const root=mkdtempSync(join(tmpdir(),'aegis-s3-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const id=crypto.randomUUID();const body=crypto.randomBytes(128);writeFileSync(join(root,'ledger.enc'),body);
  writeFileSync(join(root,'manifest.json'),JSON.stringify({context:{backup_id:id},ciphertext_sha256:crypto.createHash('sha256').update(body).digest('hex')}));
  const calls=[];const objects=new Map();
  const runner=async args=>{
    calls.push(args);const operation=args[1];const get=flag=>args[args.indexOf(flag)+1];
    if(operation==='get-bucket-versioning')return{Status:'Enabled'};
    if(operation==='get-public-access-block')return{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}};
    if(operation==='put-object'){
      assert.equal(get('--if-none-match'),'*');assert.equal(get('--server-side-encryption'),'aws:kms');
      objects.set(get('--key'),readFileSync(get('--body')));
      return{VersionId:'version-1',ChecksumSHA256:get('--checksum-sha256'),ServerSideEncryption:'aws:kms',SSEKMSKeyId:config.kms_key_arn};
    }
    if(operation==='get-object'){if(!get('--key').endsWith('/s3-receipt.json'))assert.equal(get('--version-id'),'version-1');writeFileSync(args.at(-1),objects.get(get('--key')));return{};}
    throw new Error('UNEXPECTED_TEST_S3_CALL');
  };
  const target=new S3BackupTarget(config,{runner});const receipt=await target.upload(root);assert.equal(receipt.external_copy_completed,true);
  assert.ok(calls.filter(a=>a[1]==='put-object').at(-1).includes(`${config.prefix}/${id}/s3-receipt.json`));
  await target.download({backupId:id,destinationDirectory:join(root,'download')});
  assert.deepEqual(readFileSync(join(root,'download','ledger.enc')),body);
  objects.set(`${config.prefix}/${id}/ledger.enc`,Buffer.from('tampered'));
  await assert.rejects(target.download({backupId:id,destinationDirectory:join(root,'bad'),receipt}),/CHECKSUM_MISMATCH/);
});
test('S3 refuses disabled versioning and invalid target before uploading',async t=>{
 const root=mkdtempSync(join(tmpdir(),'aegis-s3-fail-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const body=Buffer.from('ciphertext');writeFileSync(join(root,'ledger.enc'),body);
 writeFileSync(join(root,'manifest.json'),JSON.stringify({context:{backup_id:crypto.randomUUID()},ciphertext_sha256:crypto.createHash('sha256').update(body).digest('hex')}));
 assert.throws(()=>new S3BackupTarget({...config,expected_bucket_owner:'unknown'}),/INVALID_S3/);
 const target=new S3BackupTarget(config,{runner:async args=>{assert.notEqual(args[1],'put-object');return{};}});
 await assert.rejects(target.upload(root),/VERSIONING/);
});
