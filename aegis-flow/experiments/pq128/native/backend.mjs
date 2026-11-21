// Isolated native laboratory proof adapter. The SDK security parameters are
// unchanged and DO NOT demonstrate PQ128. No network/ledger imports this file.
import {createHash} from 'node:crypto';
import {accessSync,constants,readFileSync,mkdtempSync,writeFileSync,statSync,rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertFinancialStatement512,financialStatementDigest512} from '../financial/relation.mjs';
export const NATIVE512_SCHEME='AEGIS-EXPERIMENT-NATIVE512-COMPOSITE-V1';
const HERE=fileURLToPath(new URL('./',import.meta.url)),ROOT=fileURLToPath(new URL('../../../../',import.meta.url));
const run=promisify(execFile),MAX_RECEIPT=8*1024*1024;
const SOURCE_FILES=['guest/Cargo.toml','guest/Cargo.lock','guest/src/lib.rs','guest/src/main.rs','guest/src/bin/check.rs','build.py'];
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const receiptHash=b=>createHash('sha512').update(b).digest('hex');

export class Native512LaboratoryBackend{
  #manifestPath;#program;#verifier;#r0vm;#timeout;#manifest;
  constructor({manifestPath=join(ROOT,'work/native512/program.json'),programPath=join(ROOT,'work/native512/program.bin'),
    verifierPath=join(ROOT,'work/stark-target/host/release/aegis-stark-verifier'),r0vmPath=join(ROOT,'work/risc0/bin/r0vm'),timeoutMs=1200000}={}){
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>1200000)throw new TypeError('invalid laboratory proof timeout');
    this.#manifestPath=resolve(manifestPath);this.#program=resolve(programPath);this.#verifier=resolve(verifierPath);this.#r0vm=resolve(r0vmPath);this.#timeout=timeoutMs;
  }
  #check({prover=false}={}){
    // The manifest is an independently trusted LOCAL build input, never a
    // field received with a proof. This is not a binary/source attestation.
    const m=JSON.parse(readFileSync(this.#manifestPath,'utf8'));
    const tools=JSON.parse(readFileSync(join(ROOT,'aegis-flow/services/proof-engine/tools.lock.json'),'utf8'));
    if(m.schema!=='AEGIS_EXPERIMENT_NATIVE512_PROGRAM_V1'||m.sdk!=='3.1.0'||m.receipt_kind!=='composite'||
      m.aegis_target_met!==false||m.production_ready!==false||!/^([0-9a-f]{64})$/.test(m.program_id)||
      JSON.stringify(m.source_files)!==JSON.stringify(SOURCE_FILES))throw new Error('UNTRUSTED_LABORATORY_MANIFEST');
    const h=createHash('sha256');for(const name of SOURCE_FILES)h.update(name+'\0').update(readFileSync(join(HERE,name)));
    if(h.digest('hex')!==m.source_sha256||sha(this.#verifier)!==m.verifier_sha256)throw new Error('LABORATORY_SOURCE_OR_VERIFIER_MISMATCH');
    accessSync(this.#verifier,constants.X_OK);
    if(prover){
      accessSync(this.#r0vm,constants.X_OK);
      if(m.r0vm_sha256!==tools.r0vm_sha256||sha(this.#r0vm)!==tools.r0vm_sha256||sha(this.#program)!==m.program_binary_sha256)throw new Error('LABORATORY_PROVER_MISMATCH');
    }
    this.#manifest=m;return m;
  }
  get programId(){return this.#check().program_id;}
  availableForVerification(){try{this.#check();return true;}catch{return false;}}
  availableForProving(){try{this.#check({prover:true});return true;}catch{return false;}}
  async #execute(file,args,timeout){
    try{return await run(file,args,{env:{...process.env,RISC0_DEV_MODE:'0',RAYON_NUM_THREADS:'2'},timeout,maxBuffer:262144});}
    catch{throw new Error('LABORATORY_NATIVE_OPERATION_FAILED');} // Never expose decoder/guest stderr or witness.
  }
  async prove({statement,witness}){
    const m=this.#check({prover:true});statement=structuredClone(statement);witness=structuredClone(witness);
    assertFinancialStatement512(statement);
    if(!witness||typeof witness!=='object'||Array.isArray(witness)||Object.keys(witness).sort().join(',')!=='inputs,outputs')throw new Error('INVALID_PRIVATE_WITNESS');
    const payload=JSON.stringify({statement,...witness});if(Buffer.byteLength(payload)>262144)throw new Error('PRIVATE_WITNESS_TOO_LARGE');
    const dir=mkdtempSync(join(tmpdir(),'aegis-native512-prove-'));
    try{
      const input=join(dir,'private-input.json'),output=join(dir,'receipt.bin');writeFileSync(input,payload,{mode:0o600});
      await this.#execute(this.#r0vm,['--elf',this.#program,'--initial-input',input,'--receipt',output,'--receipt-kind','composite','--hashfn','poseidon2','--po2','18'],this.#timeout);
      if(statSync(output).size>MAX_RECEIPT)throw new Error('LABORATORY_RECEIPT_TOO_LARGE');
      const proof={scheme:NATIVE512_SCHEME,program_id:m.program_id,statement_digest:financialStatementDigest512(statement),receipt:readFileSync(output).toString('base64')};
      if(!(await this.verify({statement,proof})).valid)throw new Error('LABORATORY_GENERATED_PROOF_INVALID');
      return proof;
    }finally{rmSync(dir,{recursive:true,force:true});}
  }
  async verify(input){
    let dir;
    try{
      let {statement,proof}=input??{};
      const m=this.#check();statement=structuredClone(statement);proof=structuredClone(proof);assertFinancialStatement512(statement);
      if(!proof||typeof proof!=='object'||Array.isArray(proof)||Object.keys(proof).sort().join(',')!=='program_id,receipt,scheme,statement_digest'||
        proof.scheme!==NATIVE512_SCHEME||proof.program_id!==m.program_id||proof.statement_digest!==financialStatementDigest512(statement)||
        typeof proof.receipt!=='string'||proof.receipt.length>Math.ceil(MAX_RECEIPT/3)*4)return {valid:false};
      const bytes=Buffer.from(proof.receipt,'base64');if(!bytes.length||bytes.length>MAX_RECEIPT||bytes.toString('base64')!==proof.receipt)return {valid:false};
      dir=mkdtempSync(join(tmpdir(),'aegis-native512-verify-'));const receipt=join(dir,'receipt.bin'),expected=join(dir,'public-statement.json');
      writeFileSync(receipt,bytes,{mode:0o600});writeFileSync(expected,JSON.stringify(statement),{mode:0o600});
      const out=await this.#execute(this.#verifier,[receipt,expected,m.program_id],10000),status=JSON.parse(out.stdout);
      return {valid:status.valid===true&&status.backend==='risc0-composite-3.1.0',program_id:m.program_id,proof_digest:receiptHash(bytes),
        engine_profile:'RISC0-3.1.0-LABORATORY',aegis_target_met:false,production_ready:false};
    }catch{return {valid:false};}
    finally{if(dir)rmSync(dir,{recursive:true,force:true});}
  }
}
