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
import {verifyOneInOneOutNative512} from './verify-one-in-one-out.mjs';

const enabled=process.env.AEGIS_V4_FULL_WIRED_SHA512==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
// Prover phase timings are safe to print: no witness bits, amounts or
// preimages are emitted. stderr is inherited so cancelled CI jobs retain
// the last completed native stage instead of losing all diagnostics.
const run=(...args)=>execFileSync(binary,args,{encoding:'utf8',
  timeout:1_500_000,maxBuffer:1024*1024,stdio:['ignore','pipe','inherit']});
const stage=(name,start)=>process.stderr.write(
  'AEGIS_FULL_SHA512_STAGE='+name+' elapsed_ms='+Math.round(performance.now()-start)+
  ' node_rss_mb='+Math.round(process.memoryUsage().rss/1048576)+'\n');

test('complete 1x1 SHA512 circuit produces Plonky3 proof with LogUp wire consistency (resource experiment)',
  {skip:!enabled,timeout:1_700_000},()=>{
  assert.ok(binary?.startsWith('/'),'explicit pinned native prover/verifier');
  const started=performance.now();
  const dir=mkdtempSync(join(tmpdir(),'aegis-v4-full-1x1-'));
  stage('fixture-start',started);
  try{
    const f=native512Fixture({leafCount:1,value:'100',outputValue:'99',fee:'1'});
    const digest=financialStatementDigest512(f.statement);
    const manifest=compileOneInOneOut512({statement:f.statement,expectedStatementDigest:digest});
    assert.equal(manifest.hash_calls,6);
    assert.ok(manifest.gate_count>1_000_000);
    stage('six-sha512-public-circuit-compiled',started);
    const programPath=join(dir,'trusted-public-program.bin');
    const witnessPath=join(dir,'private-assignment.bin');
    const proofPath=join(dir,'public-proof.json');
    const pub=writeOneInOneOutPublicProgram512(manifest,programPath);
    assert.equal(pub.statement_digest,digest);
    assert.equal(pub.byte_length,readFileSync(programPath).byteLength);
    const actualRbr=JSON.parse(run('security-report-wired',programPath));
    assert.equal(actualRbr.rbr_report_is_for_actual_compiled_wired_air,true);
    assert.ok(actualRbr.rbr_breakdown.udr.terms.some(t=>t.label==='logup-fingerprint'));
    assert.equal(actualRbr.qrom_fiat_shamir_reduction_proved,false);
    process.stderr.write('AEGIS_FINANCIAL_RBR_PUBLIC='+JSON.stringify({
      rows:actualRbr.trace_rows,constraints:actualRbr.constraints,
      degree:actualRbr.constraint_degree,quotient_chunks:actualRbr.num_quotient_chunks,
      queries:actualRbr.fri_queries,rbr_bits:actualRbr.rbr_bits,
      udr:actualRbr.rbr_breakdown.udr.terms.map(t=>t.label),
    })+'\n');
    stage('actual-six-sha512-wired-rbr-computed',started);
    const privateStatus=writeOneInOneOutPrivateAssignment512(manifest,f.witness,witnessPath);
    assert.equal(privateStatus.private_assignment_file_created,true);
    assert.equal(privateStatus.byte_length,manifest.wire_count);
    stage('private-witness-generated',started);
    run('prove-wired',programPath,witnessPath,proofPath);
    stage('plonky3-native-proof-created',started);
    const proof=JSON.parse(readFileSync(proofPath,'utf8'));
    assert.equal(proof.program_sha512,pub.program_sha512);
    assert.equal(JSON.stringify(proof).includes(f.witness.inputs[0].spend_secret),false);
    const verified=JSON.parse(run('verify-wired',programPath,proofPath,pub.program_sha512));
    assert.equal(verified.valid,true);
    stage('native-plonky3-proof-verified',started);
    assert.equal(verified.boolean_gate_relations_proved,true);
    assert.equal(verified.cross_row_wire_consistency_proved,true);
    // Financial promotion must be performed only by an audited, trusted
    // verifier that reconstructs the exact statement-derived program.
    assert.equal(verified.financial_relation_proved,false);
    assert.equal(verified.aegis_target_met,false);
    assert.equal(verified.production_ready,false);
    // Verify the real financial facade using a binary pin independent
    // from the proof and a program freshly compiled from public inputs.
    const binaryDigest=createHash('sha512').update(readFileSync(binary)).digest('hex');
    const admitted=verifyOneInOneOutNative512({
      statement:f.statement,expectedStatementDigest:digest,
      binaryPath:binary,expectedBinarySha512:binaryDigest,proofPath,
    });
    assert.equal(admitted.valid,true);
    stage('independently-recompiled-financial-verifier-accepted',started);
    assert.equal(admitted.financial_relation_proved,true);
    assert.equal(admitted.aegis_target_met,false);
    assert.equal(admitted.production_ready,false);
    assert.equal(verifyOneInOneOutNative512({
      statement:f.statement,expectedStatementDigest:digest,
      binaryPath:binary,expectedBinarySha512:'00'.repeat(64),proofPath,
    }).valid,false);
    const forgedPublic={...f.statement,fee:'2'};
    assert.equal(verifyOneInOneOutNative512({
      statement:forgedPublic,expectedStatementDigest:digest,
      binaryPath:binary,expectedBinarySha512:binaryDigest,proofPath,
    }).valid,false);
    // Modify ONLY the statement-binding bytes: the SHA-512 Boolean
    // instructions remain byte-for-byte identical. A real STARK proof
    // MUST be rejected for the other financial statement.
    const changedProgram=Buffer.from(readFileSync(programPath));
    const header=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V2\0','ascii').length+8;
    changedProgram[header]^=1;
    const otherProgram=join(dir,'other-public-program.bin');
    writeFileSync(otherProgram,changedProgram);
    const otherProgramSha=createHash('sha512').update(changedProgram).digest('hex');
    assert.notEqual(otherProgramSha,pub.program_sha512);
    assert.equal(JSON.parse(run('verify-wired',otherProgram,proofPath,otherProgramSha)).valid,false);
    stage('statement-rebinding-rejected',started);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
