import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
import {runAwsJson} from './aws-cli.mjs';
import {assertS3Config} from './s3.mjs';
export function assertDestination(d){
 if(!d||Object.keys(d).sort().join(',')!=='bucket,expected_bucket_owner,prefix,region,schema'||d.schema!=='AEGIS_S3_DESTINATION_V1'||typeof d.bucket!=='string'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(d.bucket)||/\.\.|^\d+\.\d+\.\d+\.\d+$/.test(d.bucket)||typeof d.expected_bucket_owner!=='string'||!/^\d{12}$/.test(d.expected_bucket_owner)||typeof d.region!=='string'||!/^[a-z]{2}(?:-[a-z]+)+-\d$/.test(d.region)||typeof d.prefix!=='string'||d.prefix.length>128||!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(d.prefix))throw Error('INVALID_S3_DESTINATION');
 return d;
}
const partition=region=>region.startsWith('cn-')?'aws-cn':region.startsWith('us-gov-')?'aws-us-gov':'aws';
const publicBlock=c=>['BlockPublicAcls','IgnorePublicAcls','BlockPublicPolicy','RestrictPublicBuckets'].every(k=>c?.[k]===true);
export async function inspectDestination(destination,{runner=runAwsJson,kmsKeyArn}={}){
 const d=structuredClone(assertDestination(destination)),issues=[];const checks={};const report={schema:'AEGIS_S3_INSPECTION_V1',destination:d,checks,issues,configuration_ready:false,write_read_access_verified:false,production_ready:false,read_only:true,live_aws_transport:runner===runAwsJson};
 const call=(service,operation,args=[])=>runner([service,operation,...(service==='s3api'?['--bucket',d.bucket,'--expected-bucket-owner',d.expected_bucket_owner]:[]),'--region',d.region,'--output','json',...args]);
 try{
  const identity=await call('sts','get-caller-identity');report.caller={account:identity.Account,arn:identity.Arn};checks.authenticated=typeof identity.Account==='string'&&/^\d{12}$/.test(identity.Account);
  checks.non_root_principal=typeof identity.Arn==='string'&&!identity.Arn.endsWith(':root');if(!checks.authenticated||!checks.non_root_principal)issues.push('DEDICATED_IAM_PRINCIPAL_REQUIRED');
  const location=await call('s3api','get-bucket-location');const region=location.LocationConstraint==='EU'?'eu-west-1':location.LocationConstraint||'us-east-1';checks.region_matches=region===d.region;if(!checks.region_matches)issues.push('BUCKET_REGION_MISMATCH');
  const versioning=await call('s3api','get-bucket-versioning');checks.versioning_enabled=versioning.Status==='Enabled';if(!checks.versioning_enabled)issues.push('BUCKET_VERSIONING_REQUIRED');
  try{const access=await call('s3api','get-public-access-block');checks.public_access_blocked=publicBlock(access.PublicAccessBlockConfiguration);}catch(e){if(e.message!=='AWS_PUBLIC_ACCESS_BLOCK_MISSING')throw e;checks.public_access_blocked=false;}
  if(!checks.public_access_blocked)issues.push('BUCKET_PUBLIC_ACCESS_BLOCK_REQUIRED');
  let selected=kmsKeyArn;
  if(!selected){try{const encryption=await call('s3api','get-bucket-encryption');const rules=encryption.ServerSideEncryptionConfiguration?.Rules??[];const rule=rules.find(r=>r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm==='aws:kms');selected=rule?.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID;}catch(e){if(e.message!=='AWS_BUCKET_ENCRYPTION_CONFIGURATION_MISSING')throw e;}}
  if(!selected){checks.kms_key_enabled=false;issues.push('KMS_KEY_SELECTION_REQUIRED');}
  else{
   const response=await call('kms','describe-key',['--key-id',selected]);const m=response.KeyMetadata;
   checks.kms_key_enabled=m?.Enabled===true&&m.KeyState==='Enabled'&&m.KeyUsage==='ENCRYPT_DECRYPT'&&m.KeySpec==='SYMMETRIC_DEFAULT';
   if(!checks.kms_key_enabled)issues.push('KMS_SYMMETRIC_ENABLED_KEY_REQUIRED');
   try{const target=assertS3Config({...d,schema:'AEGIS_S3_BACKUP_TARGET_V1',kms_key_arn:m?.Arn});report.target=target;}catch{issues.push('KMS_REGION_OR_OWNER_MISMATCH');}
  }
 }catch(e){issues.push(/^[A-Z0-9_]+$/.test(e.message)?e.message:'AWS_INSPECTION_FAILED');}
 report.configuration_ready=issues.length===0&&Object.values(checks).every(Boolean)&&Boolean(report.target);
 return report;
}
export function inspectionPolicy(destination){const d=assertDestination(destination),p=partition(d.region);return{Version:'2012-10-17',Statement:[
 {Sid:'InspectAegisBackupBucket',Effect:'Allow',Action:['s3:GetBucketLocation','s3:GetBucketVersioning','s3:GetBucketPublicAccessBlock','s3:GetEncryptionConfiguration'],Resource:`arn:${p}:s3:::${d.bucket}`},
 {Sid:'DescribeBackupKeyCandidates',Effect:'Allow',Action:'kms:DescribeKey',Resource:`arn:${p}:kms:${d.region}:${d.expected_bucket_owner}:key/*`},
]};}
export function backupPolicies(config){
 const c=assertS3Config(config),p=partition(c.region),bucket=`arn:${p}:s3:::${c.bucket}`,scope=`${bucket}/${c.prefix}/*`,suffix=p==='aws-cn'?'amazonaws.com.cn':'amazonaws.com';
 const readBucket={Sid:'InspectBackupBucket',Effect:'Allow',Action:['s3:GetBucketVersioning','s3:GetBucketPublicAccessBlock'],Resource:bucket};
 const readObjects={Sid:'ReadPinnedBackupVersions',Effect:'Allow',Action:['s3:GetObject','s3:GetObjectVersion'],Resource:scope};
 const kms={Sid:'UseOnlyBackupKeyThroughS3',Effect:'Allow',Action:['kms:GenerateDataKey','kms:Decrypt'],Resource:c.kms_key_arn,Condition:{StringEquals:{'kms:ViaService':`s3.${c.region}.${suffix}`},StringLike:{'kms:EncryptionContext:aws:s3:arn':[bucket,scope]}}};
 const reader={Version:'2012-10-17',Statement:[readBucket,readObjects,kms]};
 const writer={Version:'2012-10-17',Statement:[readBucket,readObjects,{Sid:'CreateImmutableBackups',Effect:'Allow',Action:'s3:PutObject',Resource:scope,Condition:{StringEquals:{'s3:if-none-match':'*'}}},kms]};
 const prefixStatements=[
 {Sid:'AegisPowRequireTls',Effect:'Deny',Principal:'*',Action:'s3:*',Resource:scope,Condition:{Bool:{'aws:SecureTransport':'false'}}},
 {Sid:'AegisPowRequireKms',Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:scope,Condition:{StringNotEquals:{'s3:x-amz-server-side-encryption':'aws:kms'}}},
 {Sid:'AegisPowRequireBackupKey',Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:scope,Condition:{StringNotEquals:{'s3:x-amz-server-side-encryption-aws-kms-key-id':c.kms_key_arn}}},
 {Sid:'AegisPowRequireConditionalCreate',Effect:'Deny',Principal:'*',Action:'s3:PutObject',Resource:scope,Condition:{Null:{'s3:if-none-match':'true'}}},
 ];return{writer,reader,prefixStatements};
}
export function mergeBucketPolicy(existing,additions){
 if(existing?.Policy)existing=JSON.parse(existing.Policy);
 if(!existing||existing.Version!=='2012-10-17'||!existing.Statement)throw Error('INVALID_EXISTING_BUCKET_POLICY');
 const merged=structuredClone(existing);merged.Statement=Array.isArray(merged.Statement)?merged.Statement:[merged.Statement];
 for(const statement of additions){const previous=merged.Statement.find(s=>s.Sid===statement.Sid);if(previous&&canonicalSerialize(previous)!==canonicalSerialize(statement))throw Error('BUCKET_POLICY_SID_CONFLICT');if(!previous)merged.Statement.push(structuredClone(statement));}return merged;
}
