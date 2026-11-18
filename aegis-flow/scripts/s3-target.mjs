import {parseArgs} from 'node:util';import{readFileSync,writeFileSync,mkdirSync,mkdtempSync}from'node:fs';import{join,dirname}from'node:path';import{tmpdir}from'node:os';
import{assertDestination,inspectDestination,inspectionPolicy,backupPolicies,mergeBucketPolicy}from'../services/recovery/s3-setup.mjs';
import{assertS3Config}from'../services/recovery/s3.mjs';
const{positionals,values:v}=parseArgs({allowPositionals:true,options:{request:{type:'string'},'kms-key-arn':{type:'string'},'output-directory':{type:'string'},'existing-bucket-policy':{type:'string'}}});
if(!['plan','inspect'].includes(positionals[0])||!v.request)throw Error('Usage: s3-target.mjs plan|inspect --request FILE [--kms-key-arn ARN] [--output-directory NEW_DIR] [--existing-bucket-policy FILE]');
const request=assertDestination(JSON.parse(readFileSync(v.request,'utf8')));let directory=v['output-directory'];if(directory){mkdirSync(dirname(directory),{recursive:true,mode:0o700});mkdirSync(directory,{mode:0o700});}else directory=mkdtempSync(join(tmpdir(),'aegis-s3-setup-'));
const save=(name,value)=>writeFileSync(join(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
save('destination.json',request);save('inspection-policy.json',inspectionPolicy(request));let result;
if(positionals[0]==='inspect')result=await inspectDestination(request,{kmsKeyArn:v['kms-key-arn']});
else result={schema:'AEGIS_S3_SETUP_PLAN_V1',read_only:true,configuration_ready:false,write_read_access_verified:false,production_ready:false,issues:v['kms-key-arn']?['AWS_CONFIGURATION_NOT_INSPECTED']:['KMS_KEY_SELECTION_REQUIRED']};
save('inspection.json',result);
const target=result.configuration_ready?result.target:v['kms-key-arn']?assertS3Config({...request,schema:'AEGIS_S3_BACKUP_TARGET_V1',kms_key_arn:v['kms-key-arn']}):undefined;
if(target){save(result.configuration_ready?'target.json':'target.proposed.json',target);const policies=backupPolicies(target);save('backup-writer-policy.json',policies.writer);save('backup-reader-policy.json',policies.reader);save('bucket-prefix-statements.json',policies.prefixStatements);
 if(v['existing-bucket-policy'])save('bucket-policy.merged.proposed.json',mergeBucketPolicy(JSON.parse(readFileSync(v['existing-bucket-policy'],'utf8')),policies.prefixStatements));}
console.log(JSON.stringify({directory,configuration_ready:result.configuration_ready,issues:result.issues,changes_applied_to_aws:false,production_ready:false},null,2));
if(positionals[0]==='inspect'&&!result.configuration_ready)process.exitCode=1;
