// Independent read-only verification of a RETAINED SYNTHETIC six-SHA512
// financial receipt. Caller must obtain the statement digest and binary
// digest OUT OF BAND; a receipt cannot authorize its own verifier binary.
// No private witness is loaded. No PQ128 / quantum / ZK claim is made.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isAbsolute,join} from 'node:path';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {verifyOneInOneOutNative512} from './verify-one-in-one-out.mjs';

const sha=bytes=>createHash('sha512').update(bytes).digest('hex');
const hex512=value=>typeof value==='string'&&/^[0-9a-f]{128}$/.test(value);
const rejected=Object.freeze({
  valid:false,financial_relation_proved:false,
  private_witness_required:false,pq128_demonstrated:false,
  production_ready:false,
});

export function verifyRetainedSixSha512({
  retainedDir,binaryPath,expectedStatementDigest512,expectedBinarySha512,
}={}){
  try{
    if(!isAbsolute(retainedDir??'')||!isAbsolute(binaryPath??'')||
       !hex512(expectedStatementDigest512)||!hex512(expectedBinarySha512))
      return rejected;
    const statement=JSON.parse(readFileSync(join(retainedDir,'public-statement.json'),'utf8'));
    if(financialStatementDigest512(statement)!==expectedStatementDigest512)
      return rejected;
    const profile=JSON.parse(readFileSync(join(retainedDir,'financial-proof-profile.json'),'utf8'));
    if(profile.schema!=='AEGIS_SIX_SHA512_FINANCIAL_PROVER_RESOURCE_V1'||
       profile.hash_calls!==6||profile.native_exit_code!==0||
       profile.native_proof_generated!==true||
       profile.independent_financial_verification!==true||
       profile.statement_rebinding_rejected!==true||
       profile.statement_digest512!==expectedStatementDigest512||
       profile.prover_binary_sha512!==expectedBinarySha512||
       profile.pq128_demonstrated!==false)
      return rejected;
    const publicProgram=readFileSync(join(retainedDir,'trusted-public-program.bin'));
    if(sha(publicProgram)!==profile.public_program_sha512)return rejected;
    const verdict=verifyOneInOneOutNative512({
      statement,expectedStatementDigest:expectedStatementDigest512,
      binaryPath,expectedBinarySha512,
      proofPath:join(retainedDir,'financial-proof.json'),
    });
    if(!verdict.valid||!verdict.financial_relation_proved||
       verdict.hash_calls!==6||
       verdict.verified_program_sha512!==profile.public_program_sha512||
       verdict.aegis_target_met!==false||verdict.production_ready!==false)
      return rejected;
    return Object.freeze({
      valid:true,
      schema:'AEGIS_SIX_SHA512_RETAINED_RECEIPT_VERIFICATION_V1',
      statement_digest512:expectedStatementDigest512,
      program_sha512:profile.public_program_sha512,
      verifier_binary_sha512:expectedBinarySha512,
      hash_calls:6,
      financial_relation_proved:true,
      private_witness_required:false,
      quantum_soundness_demonstrated:false,
      knowledge_soundness_demonstrated:false,
      zero_knowledge_proved:false,
      pq128_demonstrated:false,
      production_ready:false,
    });
  }catch{return rejected;}
}

if(process.argv[1]?.endsWith('/verify-retained-six-sha512.mjs')){
  const [retainedDir,binaryPath,expectedStatementDigest512,expectedBinarySha512]=
    process.argv.slice(2);
  const result=verifyRetainedSixSha512({retainedDir,binaryPath,
    expectedStatementDigest512,expectedBinarySha512});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.valid)process.exitCode=1;
}
