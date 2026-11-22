import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
const magic=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V1\0','ascii');
const ops=[
  [1,2,3,4], // w4 = w2 & w3
  [2,4,0,5], // w5 = w4 XOR 0
  [4,5,1,0], // assert w5 == 1
];
function publicProgram(){
  const out=Buffer.alloc(magic.length+8+13*ops.length);
  magic.copy(out);
  out.writeUInt32BE(6,magic.length);
  out.writeUInt32BE(ops.length,magic.length+4);
  ops.forEach(([op,a,b,z],i)=>{
    const off=magic.length+8+i*13;
    out[off]=op;
    [a,b,z].forEach((x,j)=>out.writeUInt32BE(x,off+1+j*4));
  });
  return out;
}
const run=(...argv)=>execFileSync(binary,argv,{encoding:'utf8',
  timeout:90000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});

test('native Plonky3 LogUp STARK proves a fixed Boolean program and rejects tampering',
  {skip:!enabled,timeout:120000},()=>{
  assert.ok(binary?.startsWith('/'));
  const dir=mkdtempSync(join(tmpdir(),'aegis-v4-wired-'));
  try{
    const prog=publicProgram(),programFile=join(dir,'program.bin'),
      privateFile=join(dir,'private.bin'),proofFile=join(dir,'proof.json');
    const digest=createHash('sha512').update(prog).digest('hex');
    writeFileSync(programFile,prog,{mode:0o600});
    writeFileSync(privateFile,Buffer.from([0,1,1,1,1,1]),{mode:0o600});
    run('prove-wired',programFile,privateFile,proofFile);
    const proof=JSON.parse(readFileSync(proofFile,'utf8'));
    assert.equal(proof.scheme,'AEGIS_V4_PLONKY3_WIRED_LOGUP_RESEARCH_V1');
    assert.equal(proof.program_sha512,digest);
    assert.equal(Object.hasOwn(proof,'wire_values'),false);
    const ok=JSON.parse(run('verify-wired',programFile,proofFile,digest));
    assert.equal(ok.valid,true);
    assert.equal(ok.boolean_gate_relations_proved,true);
    assert.equal(ok.cross_row_wire_consistency_proved,true);
    assert.equal(ok.financial_relation_proved,false);
    assert.equal(ok.aegis_target_met,false);
    assert.equal(ok.production_ready,false);
    assert.equal(JSON.parse(run('verify-wired',programFile,proofFile,'aa'.repeat(64))).valid,false);
    const tampered=structuredClone(proof);
    const bytes=Buffer.from(tampered.proof,'base64');bytes[bytes.length>>1]^=1;
    tampered.proof=bytes.toString('base64');
    const badFile=join(dir,'tampered.json');
    writeFileSync(badFile,JSON.stringify(tampered));
    assert.equal(JSON.parse(run('verify-wired',programFile,badFile,digest)).valid,false);
    const badProgram=Buffer.from(prog);badProgram[magic.length+8]=2;
    const otherFile=join(dir,'other.bin');writeFileSync(otherFile,badProgram);
    assert.equal(JSON.parse(run('verify-wired',otherFile,proofFile,digest)).valid,false);
    const wrongWitness=join(dir,'wrong-private.bin');
    writeFileSync(wrongWitness,Buffer.from([0,1,1,0,1,1]));
    // A release prover need not detect unsatisfied constraints locally;
    // if it emits bytes anyway, the independent verifier MUST reject them.
    const wrongProof=join(dir,'wrong-proof.json');
    try{
      run('prove-wired',programFile,wrongWitness,wrongProof);
      assert.equal(JSON.parse(run('verify-wired',programFile,wrongProof,digest)).valid,false);
    }catch(error){
      if(error?.code==='ERR_ASSERTION')throw error;
      if(!error?.status)throw error;
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
