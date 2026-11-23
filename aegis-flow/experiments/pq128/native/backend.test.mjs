import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Native512LaboratoryBackend,NATIVE512_SCHEME} from './backend.mjs';
import {native512Fixture} from './fixtures.mjs';
import {assertStarkStatement} from '../../../libs/crypto-core/stark-statement.mjs';

test('an absent or malformed local build cannot enable a native laboratory backend',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'native512-manifest-test-'));
  try{
    const path=join(dir,'manifest.json'),b=new Native512LaboratoryBackend({manifestPath:path});
    assert.equal(b.availableForVerification(),false);assert.equal(b.availableForProving(),false);
    assert.deepEqual(await b.verify(null),{valid:false});assert.deepEqual(await b.verify(undefined),{valid:false});
    assert.deepEqual(await b.verify(native512Fixture()),{valid:false});
    for(const m of [{},{schema:'AEGIS_EXPERIMENT_NATIVE512_PROGRAM_V1',sdk:'3.1.0',production_ready:true},
      {schema:'AEGIS_EXPERIMENT_NATIVE512_PROGRAM_V1',sdk:'3.1.0',receipt_kind:'composite',aegis_target_met:false,production_ready:false,program_id:'00'.repeat(32),source_files:['../../outside']}]){
      writeFileSync(path,JSON.stringify(m));assert.equal(b.availableForVerification(),false);
      assert.deepEqual(await b.verify({...native512Fixture(),proof:{scheme:NATIVE512_SCHEME,receipt:'fake'}}),{valid:false});
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('laboratory statements have a separate protocol; verifier timeout and runtime gates are bounded',()=>{
  const {statement}=native512Fixture();assert.throws(()=>assertStarkStatement(statement));
  for(const timeoutMs of [0,999,1200001,NaN,Infinity])assert.throws(()=>new Native512LaboratoryBackend({timeoutMs}));
  assert.notEqual(NATIVE512_SCHEME,'RISC0-COMPOSITE-STARK-V1');
});
