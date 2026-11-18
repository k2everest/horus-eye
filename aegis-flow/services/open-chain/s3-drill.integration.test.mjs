import test from'node:test';import assert from'node:assert/strict';import{mkdtempSync,readFileSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import crypto from'node:crypto';
import{defaultStarkBackend}from'../proof-engine/backend.mjs';import{OpenChain}from'./chain.mjs';import{runPowS3Drill}from'./s3-drill.mjs';import{S3BackupTarget}from'../recovery/s3.mjs';import{memoryS3}from'../recovery/testing/memory-s3.mjs';
test('restore drill verifies a genuine cached STARK through the native backend (S3 transport simulated)',{skip:!process.env.AEGIS_POW_RECOVERY_ARTIFACT,timeout:120000},async t=>{
 const artifact=JSON.parse(readFileSync(process.env.AEGIS_POW_RECOVERY_ARTIFACT)),backend=defaultStarkBackend();assert.ok(backend.availableForVerification());assert.ok(artifact.blocks.some(b=>b.transaction));
 const root=mkdtempSync(join(tmpdir(),'pow-s3-native-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const directory=join(root,'node'),chain=await OpenChain.open({directory,config:artifact.config,backend});try{
  for(const b of artifact.blocks)await chain.addBlock(b);const keyFile=join(root,'key');writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
  const s3={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'queer-altcoin',region:'us-east-2',expected_bucket_owner:'941554679497',prefix:'aegis/pow/v2',kms_key_arn:'arn:aws:kms:us-east-2:941554679497:key/test-key'},memory=memoryS3(s3);
  const result=await runPowS3Drill({chainDirectory:directory,config:artifact.config,backupDirectory:join(root,'backups'),outputDirectory:join(root,'drills'),keyFile,minimumWork:chain.tip.work,target:new S3BackupTarget(s3,{runner:memory.runner}),backend});
  assert.equal(result.report.outcome,'VERIFIED');assert.equal(result.report.native_stark_backend,true);assert.equal(result.report.external_transport_used,false);assert.equal(result.report.tip.hash,chain.tip.hash);
 }finally{chain.close();}
});
