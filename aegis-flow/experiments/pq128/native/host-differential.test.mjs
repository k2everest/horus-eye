import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {native512Fixture,expectedNative512Statement} from './fixtures.mjs';
import {checkTransferWitness512} from '../financial/relation.mjs';
import {noteCommitment512} from '../financial/notes.mjs';
const enabled=process.env.AEGIS_NATIVE512_HOST_TESTS==='1';
const command=process.env.AEGIS_NATIVE512_HOST_CHECK||fileURLToPath(new URL('../../../../work/native512-host/debug/native512-check',import.meta.url));
const run=f=>spawnSync(command,[],{input:JSON.stringify({statement:f.statement,...f.witness}),encoding:'utf8',maxBuffer:32768,timeout:10000});

test('Rust and JavaScript accept the same generated private relation and publish only its statement',{skip:!enabled},()=>{
  for(const opts of [{leafCount:1},{leafCount:3,index:0},{leafCount:3,index:1},{leafCount:3,index:2},{leafCount:7,index:6},
    {leafCount:1,value:'9007199254740991',outputValue:'9007199254740990',fee:'1'}]){
    const f=native512Fixture(opts),result=run(f);
    assert.equal(checkTransferWitness512({...f,expected:expectedNative512Statement(f.statement)}).valid,true);
    assert.equal(result.status,0,'build the native host validator first');
    assert.deepEqual(JSON.parse(result.stdout),f.statement);
    assert.equal(result.stderr,'');
    assert.ok(!result.stdout.includes(f.witness.inputs[0].spend_secret));
    assert.ok(!result.stdout.includes(f.witness.inputs[0].note.randomness));
  }
});
test('Rust and JavaScript reject adversarial witness changes and Rust errors reveal no private data',{skip:!enabled},()=>{
  const f=native512Fixture();
  for(const mutate of [
    x=>x.witness.inputs[0].spend_secret='00'.repeat(64),
    x=>x.witness.inputs[0].membership.leaf_index=3,
    x=>x.witness.inputs[0].membership.siblings[0]='00'.repeat(64),
    x=>x.witness.inputs[0].membership.leaf_count=4,
    x=>x.witness.outputs[0].value='0',x=>x.witness.outputs[0].value='01',
    x=>x.witness.outputs[0].value='9007199254740992',x=>x.witness.outputs[0].value=123,
    x=>{x.witness.outputs[0].value='104999901';x.statement.output_commitments[0]=noteCommitment512(x.witness.outputs[0]);},
    x=>x.statement.network_id='other',x=>x.statement.nullifiers[0]='00'.repeat(64),
    x=>x.statement.output_commitments[0]=x.statement.input_commitments[0],x=>x.witness.extra=true,
    x=>x.statement.fee='0100',x=>x.witness.inputs[0].note.version='AEGIS_EXPERIMENT_NOTE512_V1',
  ]){
    const altered=structuredClone(f);mutate(altered);const result=run(altered);
    let valid=false;try{valid=checkTransferWitness512({...altered,expected:expectedNative512Statement(altered.statement)}).valid;}catch{}
    assert.equal(valid,false);assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.equal(result.stderr.trim(),'INVALID_FINANCIAL512_WITNESS');
  }
});
