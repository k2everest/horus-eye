import {S3BackupTarget} from '../recovery/s3.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {createPowBackup,restorePowBackup} from './recovery.mjs';import {spendOwner} from '../../libs/crypto-core/shielded-note-v2.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');}};
test('PoW encrypted snapshot restores only after revalidation, configuration and independent work floor checks',async t=>{
 const root=mkdtempSync(join(tmpdir(),'pow-recovery-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const config={schema:'AEGIS_OPEN_POW_V2',network_id:'recovery-test',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};
 const keyFile=join(root,'key');writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});const directory=join(root,'node');const chain=await OpenChain.open({directory,config,backend});t.after(()=>chain.close());
 for(let i=0;i<3;i++)await chain.mine({ownerTag:spendOwner('03'.repeat(32))});
 const archived=await createPowBackup({chainDirectory:directory,config,outputDirectory:join(root,'backups'),keyFile,backend});
 const options={backupDirectory:archived.directory,config,keyFile,backend,minimumWork:chain.tip.work};
 const restored=await restorePowBackup({...options,destinationDirectory:join(root,'restored')});assert.equal(restored.tip.hash,chain.tip.hash);
 await assert.rejects(restorePowBackup({...options,destinationDirectory:join(root,'restored')}),/DESTINATION_EXISTS/);
 await assert.rejects(restorePowBackup({...options,destinationDirectory:join(root,'too-old'),minimumWork:(BigInt(chain.tip.work)+1n).toString()}),/BELOW_VERIFIED_WORK/);
 await assert.rejects(restorePowBackup({...options,destinationDirectory:join(root,'wrong-network'),config:{...config,monetary:{...config.monetary,max_supply:'701'}}}),/CONFIG_MISMATCH/);
 const s3config={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'aegis-pow-dr-test',region:'us-east-1',prefix:'pow/nodes',expected_bucket_owner:'123456789012',kms_key_arn:'arn:aws:kms:us-east-1:123456789012:key/test-key'};
 const objects=new Map();const target=new S3BackupTarget(s3config,{runner:async args=>{
  const operation=args[1],value=flag=>args[args.indexOf(flag)+1];
  if(operation==='get-bucket-versioning')return{Status:'Enabled'};
  if(operation==='get-public-access-block')return{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}};
  if(operation==='put-object'){objects.set(value('--key'),readFileSync(value('--body')));return{VersionId:'version-1',ChecksumSHA256:value('--checksum-sha256'),ServerSideEncryption:'aws:kms',SSEKMSKeyId:s3config.kms_key_arn};}
  if(operation==='get-object'){writeFileSync(args.at(-1),objects.get(value('--key')));return{};}
  throw Error('UNEXPECTED_S3_TEST_OPERATION');
 }});
 const receipt=await target.upload(archived.directory);assert.equal(receipt.external_copy_completed,true);
 const downloaded=join(root,'download');await target.download({backupId:receipt.backup_id,destinationDirectory:downloaded});
 const fromS3=await restorePowBackup({...options,backupDirectory:downloaded,destinationDirectory:join(root,'s3-restored')});assert.equal(fromS3.tip.hash,chain.tip.hash);
 const encrypted=join(archived.directory,'ledger.enc'),bytes=readFileSync(encrypted);bytes[0]^=1;writeFileSync(encrypted,bytes);
 await assert.rejects(restorePowBackup({...options,destinationDirectory:join(root,'tampered')}),/CHECKSUM_MISMATCH/);
});
