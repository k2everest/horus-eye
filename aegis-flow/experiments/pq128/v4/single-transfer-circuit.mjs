// 1-in/1-out complete SHA-512 *Boolean relation* for future Plonky3 AIR.
// Imports the independently compiled 6-hash, single-witness constraint
// network. This local checker is NOT an STARK proof and is NEVER a verifier.
// Private bit assignments must never be serialized, logged or returned.
import {assertFinancialStatement512,financialStatementDigest512} from '../financial/relation.mjs';
import {createHash} from 'node:crypto';
import {writeFileSync,rmSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {compileTransferConstraints512,assignTransferConstraints512,checkTransferConstraints512} from '../constraints/transfer.mjs';
import {bitCircuitDigest512,bitConstraintCount,bitCircuitPublicProgramBinary,snapshotBitWitness} from '../constraints/bit-circuit.mjs';

const trusted=new WeakMap();
export function compileOneInOneOut512({statement,expectedStatementDigest}={}){
  // Only the public statement determines the entire circuit program shape.
  // Callers must pin this digest independently of prover-supplied proof data.
  const st=structuredClone(statement);
  assertFinancialStatement512(st);
  if(st.input_commitments.length!==1||st.output_commitments.length!==1||
     st.nullifiers.length!==1||st.anchor_leaf_count!==1)
    throw new TypeError('ONE_IN_ONE_OUT_SINGLE_LEAF_ONLY');
  if(typeof expectedStatementDigest!=='string'||
     financialStatementDigest512(st)!==expectedStatementDigest)
    throw new TypeError('INDEPENDENT_PUBLIC_STATEMENT_DIGEST_REQUIRED');
  const relation=compileTransferConstraints512({statement:st,expectedStatementDigest});
  if(relation.hashCalls!==6)throw new Error('INCOMPLETE_SHA512_RELATION');
  const manifest=Object.freeze({
    schema:'AEGIS_V4_SINGLE_TRANSFER_BOOLEAN_CONSTRAINT_MANIFEST_V1',
    network_id:st.network_id,
    statement_digest:expectedStatementDigest,
    boolean_circuit_sha512:bitCircuitDigest512(relation.circuit),
    hash_calls:relation.hashCalls,
    gate_count:relation.circuit.gateCount,
    wire_count:relation.circuit.wireCount,
    r1cs_constraint_rows:bitConstraintCount(relation.circuit),
    complete_private_financial_relation_locally_expressible:true,
    plonky3_proof_of_entire_relation:false,
    oracle_witness_private:true,
    quantum_soundness_proved:false,
    aegis_target_met:false,
    production_ready:false,
  });
  trusted.set(manifest,relation);
  return manifest;
}

export function checkOneInOneOutWitnessLocally(manifest,witness){
  const relation=trusted.get(manifest);
  if(!relation)throw new TypeError('TRUSTED_COMPILED_CIRCUIT_REQUIRED');
  // The independent Boolean checker verifies the entire fixed SHA-512
  // circuit, including ownership, note commitment, nullifier, one-leaf
  // Merkle root, positive 53-bit values and conservation with the fee.
  // It exposes only a local pass/fail, never a witness or STARK receipt.
  let valid=false;
  try{
    const assignment=assignTransferConstraints512(relation,witness);
    valid=checkTransferConstraints512(relation,assignment);
  }catch{valid=false;}
  return Object.freeze({
    local_constraints_satisfied:valid,
    statement_digest:manifest.statement_digest,
    boolean_circuit_sha512:manifest.boolean_circuit_sha512,
    cryptographic_proof:false,
    plonky3_proof_of_entire_relation:false,
    knowledge_demonstrated:false,
    privacy_demonstrated:false,
    aegis_target_met:false,
    production_ready:false,
  });
}

// Generate a verifier-owned, deterministic public program. In production this
// must be rebuilt from a statement authenticated by an independent node;
// a program file sent by the prover is untrusted, even with a self-hash.
export function writeOneInOneOutPublicProgram512(manifest,path){
  const relation=trusted.get(manifest);
  if(!relation||!isAbsolute(path))throw new TypeError('trusted public program and absolute destination required');
  const bytes=bitCircuitPublicProgramBinary(relation.circuit);
  const programSha512=createHash('sha512').update(bytes).digest('hex');
  writeFileSync(path,bytes,{mode:0o600,flag:'wx'});
  return Object.freeze({
    schema:'AEGIS_V4_SINGLE_TRANSFER_NATIVE_PUBLIC_PROGRAM_V1',
    program_sha512:programSha512,
    canonical_circuit_digest512:manifest.boolean_circuit_sha512,
    statement_digest:manifest.statement_digest,
    byte_length:bytes.length,
    gate_count:manifest.gate_count,
    private_witness_written:false,
    pq128_demonstrated:false,
    production_ready:false,
  });
}

// Keep raw wire assignments private. This is ONLY a prover-side helper;
// successful local preflight is NOT the proof. Native verifier must
// independently validate the public program and the LogUp STARK.
export function writeOneInOneOutPrivateAssignment512(manifest,witness,path){
  const relation=trusted.get(manifest);
  if(!relation||!isAbsolute(path))throw new TypeError('trusted circuit and absolute private path required');
  const assigned=assignTransferConstraints512(relation,witness);
  if(!checkTransferConstraints512(relation,assigned))throw new Error('INVALID_PRIVATE_SINGLE_TRANSFER');
  const bits=snapshotBitWitness(relation.circuit,assigned);
  try{
    writeFileSync(path,Buffer.from(bits),{mode:0o600,flag:'wx'});
    return Object.freeze({
      schema:'AEGIS_V4_PRIVATE_WIRING_MATERIAL_V1',
      private_assignment_file_created:true,
      byte_length:bits.length,
      scope:'local-prover-only',
      cryptographic_proof:false,
      production_ready:false,
    });
  }finally{bits.fill(0);}
}
