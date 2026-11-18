import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function runAwsJson(args){
 try{
  const result=await exec('aws',args,{timeout:600000,maxBuffer:256*1024,env:{...process.env,AWS_PAGER:'',AWS_CLI_AUTO_PROMPT:'off',AWS_MAX_ATTEMPTS:'3'}});
  return JSON.parse(result.stdout||'{}');
 }catch(error){
  let code='AWS_REQUEST_FAILED';const message=String(error.stderr??'');
  if(error.code==='ENOENT')code='AWS_CLI_REQUIRED';
  else if(/Unable to locate credentials|NoCredentialsError/.test(message))code='AWS_CREDENTIALS_REQUIRED';
  else if(/ExpiredToken|RequestExpired|InvalidClientTokenId|InvalidAccessKeyId|UnrecognizedClientException/.test(message))code='AWS_CREDENTIALS_INVALID_OR_EXPIRED';
  else if(/AccessDenied|UnauthorizedOperation|Forbidden|\(403\)/.test(message))code='AWS_ACCESS_DENIED';
  else if(/NoSuchBucket/.test(message))code='AWS_BUCKET_NOT_FOUND';
  else if(/NoSuchPublicAccessBlockConfiguration/.test(message))code='AWS_PUBLIC_ACCESS_BLOCK_MISSING';
  else if(/ServerSideEncryptionConfigurationNotFoundError/.test(message))code='AWS_BUCKET_ENCRYPTION_CONFIGURATION_MISSING';
  else if(/NoSuchKey|NoSuchVersion|NotFound|\(404\)/.test(message))code='AWS_OBJECT_NOT_FOUND';
  else if(/PreconditionFailed|\(412\)/.test(message))code='AWS_PRECONDITION_FAILED';
  throw new Error(code);
 }
}
