// Hardened research-only admission boundary for the full SHA-512 R1CS
// Plonky3 LogUp proof. Rebuilds the entire public program from an
// independently pinned statement, never from the prover's proof bundle.
// Even a passing verification does not establish PQ128, knowledge or ZK.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {
  compileOneInOneOut512,writeOneInOneOutPublicProgram512,
} from './single-transfer-circuit.mjs';

const sha512=bytes=>createHash('sha512').update(bytes).digest('hex');
const hex512=value=>typeof value==='string'&&/^[a-f0-9]{128}$/.test(value);
const failure=Object.freeze({
  valid:false,financial_relation_proved:false,
  boolean_gate_relations_proved:false,cross_row_wire_consistency_proved:false,
  verified_program_sha512:null,statement_digest:null,
  quantum_soundness_demonstrated:false,knowledge_demonstrated:false,
  privacy_demonstrated:false,aegis_target_met:false,production_ready:false,
});
export function verifyOneInOneOutNative512({
  statement,expectedStatementDigest,binaryPath,expectedBinarySha512,proofPath,
}={}){
  let folder;
  try{
    if(!hex512(expectedStatementDigest)||!hex512(expectedBinarySha512)||
      !isAbsolute(binaryPath??'')||!isAbsolute(proofPath??''))return failure;
    // Supplied hash must originate from a trusted build manifest, not the
    // prover. This check prevents an arbitrary local executable from being
    // accepted as the financial circuit verifier.
    const binary=readFileSync(binaryPath);
    if(sha512(binary)!==expectedBinarySha512)return failure;
    const manifest=compileOneInOneOut512({statement,expectedStatementDigest});
    if(manifest.hash_calls!==6||manifest.gate_count<1_000_000)return failure;
    folder=mkdtempSync(join(tmpdir(),'aegis-v4-public-program-'));
    const programPath=join(folder,'program.bin');
    const pub=writeOneInOneOutPublicProgram512(manifest,programPath);
    const proof=readFileSync(proofPath);
    if(proof.length<1||proof.length>44*1024*1024)return failure;
    const verify=spawnSync(binaryPath,['verify-wired',programPath,proofPath,pub.program_sha512],{
      encoding:'utf8',timeout:300_000,maxBuffer:65536,
      stdio:['ignore','pipe','pipe'],
    });
    if(verify.status!==0||verify.error||verify.signal)return failure;
    const result=JSON.parse(verify.stdout);
    const soundBooleanProgram=result.valid===true&&
      result.boolean_gate_relations_proved===true&&
      result.cross_row_wire_consistency_proved===true&&
      result.program_sha512===pub.program_sha512&&
      result.financial_relation_proved===false&&
      result.aegis_target_met===false&&result.production_ready===false;
    if(!soundBooleanProgram)return failure;
    // At this boundary, the native proof validates the *exact* six-hash
    // public-statement program, if and only if the underlying LogUp
    // backend is sound under its instantiated parameters.
    return Object.freeze({
      valid:true,financial_relation_proved:true,
      boolean_gate_relations_proved:true,cross_row_wire_consistency_proved:true,
      verified_program_sha512:pub.program_sha512,
      statement_digest:expectedStatementDigest,
      hash_calls:manifest.hash_calls,
      gate_count:manifest.gate_count,
      proof_security_qualified:false,
      quantum_soundness_demonstrated:false,knowledge_demonstrated:false,
      privacy_demonstrated:false,aegis_target_met:false,production_ready:false,
    });
  }catch{return failure;}
  finally{if(folder)rmSync(folder,{recursive:true,force:true});}
}
