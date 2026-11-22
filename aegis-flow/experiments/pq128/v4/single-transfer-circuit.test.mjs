import test from 'node:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {compileOneInOneOut512,checkOneInOneOutWitnessLocally,writeOneInOneOutPublicProgram512,writeOneInOneOutPrivateAssignment512} from './single-transfer-circuit.mjs';

const enabled=process.env.AEGIS_V4_ONE_CIRCUIT_INTEGRATION==='1';
test('single transfer canonical private SHA512 circuit expresses all six hashes under one witness',
  {skip:!enabled,timeout:300000},()=>{
  const fixture=native512Fixture({leafCount:1,value:'100',outputValue:'99',fee:'1'});
  const pinned=financialStatementDigest512(fixture.statement);
  const m=compileOneInOneOut512({statement:fixture.statement,expectedStatementDigest:pinned});
  assert.equal(m.hash_calls,6);
  assert.ok(m.gate_count>1_000_000);
  assert.ok(m.r1cs_constraint_rows>m.gate_count);
  assert.match(m.boolean_circuit_sha512,/^[a-f0-9]{128}$/);
  assert.equal(m.plonky3_proof_of_entire_relation,false);
  assert.equal(m.production_ready,false);
  const verified=checkOneInOneOutWitnessLocally(m,fixture.witness);
  assert.equal(verified.local_constraints_satisfied,true);
  assert.equal(verified.cryptographic_proof,false);
  assert.equal(verified.aegis_target_met,false);
  const dir=mkdtempSync(join(tmpdir(),'aegis-v4-1x1-r1cs-material-'));
  try{
    const pubPath=join(dir,'public.bin'),secretPath=join(dir,'private.bin');
    const pub=writeOneInOneOutPublicProgram512(m,pubPath);
    assert.equal(pub.statement_digest,pinned);
    const encoded=readFileSync(pubPath);
    assert.equal(encoded.length,pub.byte_length);
    const magic=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V1\0','ascii');
    assert.deepEqual(encoded.subarray(0,magic.length),magic);
    assert.equal(createHash('sha512').update(encoded).digest('hex'),pub.program_sha512);
    assert.equal(encoded.readUInt32BE(magic.length),m.wire_count);
    assert.equal(encoded.readUInt32BE(magic.length+4),m.gate_count);
    const secret=writeOneInOneOutPrivateAssignment512(m,fixture.witness,secretPath);
    assert.equal(secret.private_assignment_file_created,true);
    assert.equal(secret.byte_length,m.wire_count);
    const wireBytes=readFileSync(secretPath);
    assert.equal(wireBytes.length,m.wire_count);
    assert.equal(wireBytes[0],0);
    assert.equal(wireBytes[1],1);
  }finally{rmSync(dir,{recursive:true,force:true});}
  for(const mutate of [
    w=>{w.inputs[0].spend_secret='00'.repeat(64);},
    w=>{w.inputs[0].note.value='101';},
    w=>{w.inputs[0].note.randomness='00'.repeat(64);},
    w=>{w.outputs[0].value='100';},
    w=>{w.outputs[0].owner_tag='00'.repeat(64);},
    w=>{w.inputs[0].membership.leaf_index=1;},
  ]){
    const bad=structuredClone(fixture.witness);mutate(bad);
    assert.equal(checkOneInOneOutWitnessLocally(m,bad).local_constraints_satisfied,false);
  }
});

test('one-in-one-out circuit requires externally pinned public statement and rejects other shapes',
  {skip:!enabled,timeout:300000},()=>{
  const one=native512Fixture({leafCount:1});
  const digest=financialStatementDigest512(one.statement);
  for(const bad of [
    {...one.statement,fee:'0'},
    {...one.statement,input_commitments:['11'.repeat(64),...one.statement.input_commitments]},
    {...one.statement,anchor_leaf_count:2},
  ])assert.throws(()=>compileOneInOneOut512({statement:bad,expectedStatementDigest:digest}));
  assert.throws(()=>compileOneInOneOut512({statement:one.statement,expectedStatementDigest:'aa'.repeat(64)}));
  const m=compileOneInOneOut512({statement:one.statement,expectedStatementDigest:digest});
  assert.throws(()=>checkOneInOneOutWitnessLocally({...m},one.witness));
});
