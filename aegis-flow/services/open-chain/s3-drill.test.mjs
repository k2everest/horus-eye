import test from 'node:test';import assert from 'node:assert/strict';import{mkdtempSync,rmSync,writeFileSync,readFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import crypto from'node:crypto';
import{runPowS3Drill}from'./s3-drill.mjs';import{OpenChain}from'./chain.mjs';import{S3BackupTarget}from'../recovery/s3.mjs';import{memoryS3}from'../recovery/testing/memory-s3.mjs';import{spendOwner}from'../../libs/crypto-core/shielded-note-v2.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');}};
async function fixture(t){const root=mkdtempSync(join(tmpdir(),'pow-s3-drill-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const config={schema:'AEGIS_OPEN_POW_V2',network_id:'s3-drill-test',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};
 const directory=join(root,'node'),chain=await OpenChain.open({directory,config,backend});t.after(()=>chain.close());for(let h=0;h<3;h++)await chain.mine({ownerTag:spendOwner('05'.repeat(32))});
 const keyFile=join(root,'backup.key');writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const s3={schema:'AEGIS_S3_BACKUP_TARGET_V1',bucket:'queer-altcoin',region:'us-east-2',expected_bucket_owner:'941554679497',prefix:'aegis/pow/v2',kms_key_arn:'arn:aws:kms:us-east-2:941554679497:key/test-key'};
 return{root,chain,s3,args:{chainDirectory:directory,config,backupDirectory:join(root,'backups'),outputDirectory:join(root,'drills'),keyFile,minimumWork:chain.tip.work,backend}};
}
test('restore drill replays downloaded state and labels simulated transport honestly',async t=>{
 const f=await fixture(t),memory=memoryS3(f.s3),result=await runPowS3Drill({...f.args,target:new S3BackupTarget(f.s3,{runner:memory.runner})});
 assert.equal(result.report.outcome,'VERIFIED');assert.equal(result.report.tip.hash,f.chain.tip.hash);assert.equal(result.report.external_transport_used,false);assert.equal(result.report.native_stark_backend,false);assert.equal(result.report.evidence_accepted,false);assert.equal(result.report.production_ready,false);assert.equal(result.report.objects.length,2);assert.ok(result.report.commit_marker.version_id);
 assert.equal(readFileSync(result.report_file,'utf8').includes(readFileSync(f.args.keyFile,'utf8')),false);
});
test('insufficient independent work floor aborts before any S3 writes and records failure',async t=>{
 const f=await fixture(t),memory=memoryS3(f.s3),result=await runPowS3Drill({...f.args,minimumWork:(BigInt(f.chain.tip.work)+1n).toString(),target:new S3BackupTarget(f.s3,{runner:memory.runner})});
 assert.equal(result.report.outcome,'FAILED');assert.equal(result.report.failure_stage,'local-restore');assert.equal(result.report.failure_code,'POW_RECOVERY_BELOW_VERIFIED_WORK');assert.equal(memory.writes,0);
});
