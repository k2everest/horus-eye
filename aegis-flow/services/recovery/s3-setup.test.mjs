import test from 'node:test';import assert from 'node:assert/strict';import{assertDestination,inspectDestination,inspectionPolicy,backupPolicies,mergeBucketPolicy}from'./s3-setup.mjs';
const destination={schema:'AEGIS_S3_DESTINATION_V1',bucket:'queer-altcoin',region:'us-east-2',expected_bucket_owner:'941554679497',prefix:'aegis/pow/v2'};
const key='arn:aws:kms:us-east-2:941554679497:key/test-key';
function fixture(overrides={}){const calls=[];const runner=async args=>{calls.push(args);const name=args[1];if(Object.hasOwn(overrides,name)){const v=overrides[name];if(v instanceof Error)throw v;return v;}
 if(name==='get-caller-identity')return{Account:destination.expected_bucket_owner,Arn:'arn:aws:sts::941554679497:assumed-role/AegisBackup/session'};
 if(name==='get-bucket-location')return{LocationConstraint:'us-east-2'};
 if(name==='get-bucket-versioning')return{Status:'Enabled'};
 if(name==='get-public-access-block')return{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}};
 if(name==='get-bucket-encryption')return{ServerSideEncryptionConfiguration:{Rules:[{ApplyServerSideEncryptionByDefault:{SSEAlgorithm:'aws:kms',KMSMasterKeyID:'alias/backup'}}]}};
 if(name==='describe-key')return{KeyMetadata:{Arn:key,Enabled:true,KeyState:'Enabled',KeyUsage:'ENCRYPT_DECRYPT',KeySpec:'SYMMETRIC_DEFAULT'}};
 throw Error('UNEXPECTED_SETUP_TEST_CALL');};return{runner,calls};}
test('known existing bucket is inspected read-only and resolves canonical KMS ARN',async()=>{
 const f=fixture(),r=await inspectDestination(destination,f);assert.equal(r.configuration_ready,true);assert.equal(r.target.kms_key_arn,key);assert.equal(r.live_aws_transport,false);assert.equal(r.write_read_access_verified,false);assert.equal(r.production_ready,false);
 assert.ok(f.calls.every(c=>['get-caller-identity','get-bucket-location','get-bucket-versioning','get-public-access-block','get-bucket-encryption','describe-key'].includes(c[1])));
 for(const c of f.calls.filter(c=>c[0]==='s3api'))assert.equal(c[c.indexOf('--expected-bucket-owner')+1],destination.expected_bucket_owner);
});
test('wrong region, suspended versioning, missing public block or root cannot produce ready configuration',async()=>{
 for(const overrides of [ {'get-bucket-location':{LocationConstraint:'us-west-2'}},{'get-bucket-versioning':{Status:'Suspended'}},{'get-public-access-block':Error('AWS_PUBLIC_ACCESS_BLOCK_MISSING')},{'get-caller-identity':{Account:destination.expected_bucket_owner,Arn:'arn:aws:iam::941554679497:root'}} ])assert.equal((await inspectDestination(destination,fixture(overrides))).configuration_ready,false);
});
test('SSE-S3 bucket can use an explicit per-object KMS key without changing bucket defaults',async()=>{
 const overrides={'get-bucket-encryption':{ServerSideEncryptionConfiguration:{Rules:[{ApplyServerSideEncryptionByDefault:{SSEAlgorithm:'AES256'}}]}}};
 assert.deepEqual((await inspectDestination(destination,fixture(overrides))).issues,['KMS_KEY_SELECTION_REQUIRED']);
 const f=fixture(overrides),r=await inspectDestination(destination,{...f,kmsKeyArn:key});assert.equal(r.configuration_ready,true);assert.equal(f.calls.some(c=>c[1].startsWith('put-')),false);
 const wrong=fixture({'describe-key':{KeyMetadata:{Arn:key.replace('941554679497','111111111111'),Enabled:true,KeyState:'Enabled',KeyUsage:'ENCRYPT_DECRYPT',KeySpec:'SYMMETRIC_DEFAULT'}}});assert.equal((await inspectDestination(destination,wrong)).configuration_ready,false);
});
test('IAM plans scope all writes to backup prefix and preserve unrelated bucket/S3 Files statements',()=>{
 assert.throws(()=>assertDestination({...destination,prefix:'../other'}),/INVALID_S3_DESTINATION/);
 const policies=backupPolicies({...destination,schema:'AEGIS_S3_BACKUP_TARGET_V1',kms_key_arn:key});const scope='arn:aws:s3:::queer-altcoin/aegis/pow/v2/*';
 assert.equal(policies.writer.Statement.find(s=>s.Action==='s3:PutObject').Resource,scope);assert.equal(policies.reader.Statement.some(s=>[].concat(s.Action).includes('s3:PutObject')),false);
 assert.equal(JSON.stringify(policies.writer).includes('DeleteObject'),false);assert.ok(policies.prefixStatements.every(s=>s.Effect==='Deny'&&s.Resource===scope));
 const original={Version:'2012-10-17',Statement:[{Sid:'ExistingFilesAccess',Effect:'Allow',Principal:{AWS:'arn:aws:iam::941554679497:role/ExistingFilesRole'},Action:'s3:GetObject',Resource:'arn:aws:s3:::queer-altcoin/other/*'}]};
 const merged=mergeBucketPolicy(original,policies.prefixStatements);assert.deepEqual(merged.Statement[0],original.Statement[0]);assert.deepEqual(mergeBucketPolicy(merged,policies.prefixStatements),merged);
 const conflicting=structuredClone(merged);conflicting.Statement[1].Resource='arn:aws:s3:::another/*';assert.throws(()=>mergeBucketPolicy(conflicting,policies.prefixStatements),/SID_CONFLICT/);
 assert.equal(inspectionPolicy(destination).Statement[0].Resource,'arn:aws:s3:::queer-altcoin');
});
test('missing AWS tooling is an actionable diagnostic, never a successful external inspection',async()=>{
 const r=await inspectDestination(destination,{runner:async()=>{throw Error('AWS_CLI_REQUIRED');}});assert.equal(r.configuration_ready,false);assert.deepEqual(r.issues,['AWS_CLI_REQUIRED']);
});
