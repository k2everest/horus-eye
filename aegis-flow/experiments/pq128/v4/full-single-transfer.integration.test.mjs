// Opt-in full 1x1 SHA-512 Boolean-program Plonky3 proof.
// This is intentionally NOT in default CI: six SHA-512 circuits contain
// >1 million gates. Run only after smaller native LogUp tests pass and
// memory/time budgets are measured. Never print the private witness file.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {
  compileOneInOneOut512,writeOneInOneOutPublicProgram512,
  writeOneInOneOutPrivateAssignment512,
} from './single-transfer-circuit.mjs';

const enabled=process.env.AEGIS_V4_FULL_WIRED_SHA512==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
const run=(...args)=>execFileSync(binary,args,{encoding:'utf8',
  timeout:1_500_000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']});

test('complete 1x1 SHA512 circuit produces Plonky3 proof with LogUp wire consistency (resource experiment)',
  {skip:!enabled,timeout:1_700_000},()=>{
  assert.ok(binary?.startsWith('/'),'explicit pinned native prover/verifier');
  const dir=mkdtempSync(join(tmpdir(),'aegis-v4-full-1x1-'));
  try{
    const f=native512Fixture({leafCount:1,value:'100',outputValue:'99',fee:'1'});
    const digest=financialStatementDigest512(f.statement);
    const manifest=compileOneInOneOut512({statement:f.statement,expectedStatementDigest:digest});
    assert.equal(manifest.hash_calls,6);
    assert.ok(manifest.gate_count>1_000_000);
    const programPath=join(dir,'trusted-public-program.bin');
    const witnessPath=join(dir,'private-assignment.bin');
    const proofPath=join(dir,'public-proof.json');
    const pub=writeOneInOneOutPublicProgram512(manifest,programPath);
    assert.equal(pub.statement_digest,digest);
    assert.equal(pub.byte_length,readFileSync(programPath).byteLength);
    const privateStatus=writeOneInOneOutPrivateAssignment512(manifest,f.witness,witnessPath);
    assert.equal(privateStatus.private_assignment_file_created,true);
    assert.equal(privateStatus.byte_length,manifest.wire_count);
    run('prove-wired',programPath,witnessPath,proofPath);
    const proof=JSON.parse(readFileSync(proofPath,'utf8'));
    assert.equal(proof.program_sha512,pub.program_sha512);
    assert.equal(JSON.stringify(proof).includes(f.witness.inputs[0].spend_secret),false);
    const verified=JSON.parse(run('verify-wired',programPath,proofPath,pub.program_sha512));
    assert.equal(verified.valid,true);
    assert.equal(verified.boolean_gate_relations_proved,true);
    assert.equal(verified.cross_row_wire_consistency_proved,true);
    // Financial promotion must be performed only by an audited, trusted
    // verifier that reconstructs the exact statement-derived program.
    assert.equal(verified.financial_relation_proved,false);
    assert.equal(verified.aegis_target_met,false);
    assert.equal(verified.production_ready,false);
    const other=native512Fixture({leafCount:1,value:'101',outputValue:'100',fee:'1'});
    const altered=compileOneInOneOut512({statement:other.statement,
      expectedStatementDigest:financialStatementDigest512(other.statement)});
    const otherProgram=join(dir,'other-public-program.bin');
    const otherPub=writeOneInOneOutPublicProgram512(altered,otherProgram);
    assert.notEqual(otherPub.program_sha512,pub.program_sha512);
    assert.equal(JSON.parse(run('verify-wired',otherProgram,proofPath,otherPub.program_sha512)).valid,false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
