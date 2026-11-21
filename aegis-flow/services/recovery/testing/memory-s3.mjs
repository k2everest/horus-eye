import crypto from 'node:crypto';import{readFileSync,writeFileSync}from'node:fs';
// Transport fixture only: it neither validates STARKs nor claims real AWS access.
export function memoryS3(config,options={}){
 const calls=[],records=new Map();let serial=0;
 const checksum=data=>crypto.createHash('sha256').update(data).digest('base64');
 const find=(key,version)=>{const list=records.get(key)??[];return version?list.find(r=>r.VersionId===version):list.at(-1);};
 const seed=(key,data)=>{const r={VersionId:'version-'+(++serial),data:Buffer.from(data),ServerSideEncryption:'aws:kms',SSEKMSKeyId:config.kms_key_arn};r.ChecksumSHA256=checksum(r.data);records.set(key,[...(records.get(key)??[]),r]);return r;};
 const runner=async args=>{
  calls.push(args);const operation=args[1],get=flag=>{const at=args.indexOf(flag);return at<0?undefined:args[at+1];},key=get('--key');
  await options.beforeCall?.({operation,key,args});
  if(operation==='get-bucket-versioning')return{Status:'Enabled'};
  if(operation==='get-public-access-block')return{PublicAccessBlockConfiguration:{BlockPublicAcls:true,IgnorePublicAcls:true,BlockPublicPolicy:true,RestrictPublicBuckets:true}};
  if(operation==='head-object'){
   const r=find(key,get('--version-id'));if(!r)throw Error(options.missingHeadDenied?'AWS_ACCESS_DENIED':'AWS_OBJECT_NOT_FOUND');
   return{VersionId:r.VersionId,ContentLength:r.data.length,ChecksumSHA256:r.ChecksumSHA256,ServerSideEncryption:r.ServerSideEncryption,SSEKMSKeyId:r.SSEKMSKeyId};
  }
  if(operation==='put-object'){
   if(get('--if-none-match')!=='*')throw Error('TEST_REQUIRES_CONDITIONAL_WRITES');if(find(key))throw Error('AWS_PRECONDITION_FAILED');
   const r=seed(key,readFileSync(get('--body')));if(r.ChecksumSHA256!==get('--checksum-sha256'))throw Error('TEST_CHECKSUM_MISMATCH');
   if(get('--server-side-encryption')!=='aws:kms'||get('--ssekms-key-id')!==config.kms_key_arn)throw Error('TEST_KMS_REQUIRED');
   await options.afterPut?.({key,record:r});return{VersionId:r.VersionId,ChecksumSHA256:r.ChecksumSHA256,ServerSideEncryption:r.ServerSideEncryption,SSEKMSKeyId:r.SSEKMSKeyId};
  }
  if(operation==='get-object'){
   const r=find(key,get('--version-id'));if(!r)throw Error('AWS_OBJECT_NOT_FOUND');
   let data=options.transformRead?options.transformRead({key,data:Buffer.from(r.data)}):r.data;
   const range=get('--range');if(range){const end=Number(range.split('-')[1]);data=data.subarray(0,end+1);}
   writeFileSync(args.at(-1),data);return{VersionId:r.VersionId};
  }
  throw Error('UNEXPECTED_TEST_S3_OPERATION');
 };
 return{runner,calls,records,seed,get writes(){return serial;}};
}
