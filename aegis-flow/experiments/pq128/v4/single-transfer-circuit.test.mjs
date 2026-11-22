import test from 'node:test';
import assert from 'node:assert/strict';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {compileOneInOneOut512,checkOneInOneOutWitnessLocally} from './single-transfer-circuit.mjs';

test('single transfer canonical private SHA512 circuit expresses all six hashes under one witness',()=>{
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

test('one-in-one-out circuit requires externally pinned public statement and rejects other shapes',()=>{
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
