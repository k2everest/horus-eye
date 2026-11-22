import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512,RELATION_VERSION} from '../financial/relation.mjs';
import {createSpendIdentity512,createNote512,noteCommitment512,nullifier512} from '../financial/notes.mjs';
import {buildNoteTree512} from '../financial/membership.mjs';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
const run=(command,input,output)=>execFileSync(binary,[command,input,output],{
  timeout:90000,maxBuffer:65536,encoding:'utf8'});
const makeFiles=(dir,fixture)=>{
  const privatePath=join(dir,'private.json'),publicPath=join(dir,'public.json'),proofPath=join(dir,'proof.json');
  writeFileSync(privatePath,JSON.stringify({statement:fixture.statement,...fixture.witness}),{mode:0o600});
  writeFileSync(publicPath,JSON.stringify(fixture.statement),{mode:0o600});
  return {privatePath,publicPath,proofPath};
};

// Private multi-note fixture; all values stay within 53 bits, while
// their total can exceed 53 bits. Each input has a separate spend secret
// and inclusion proof in one common root.
function multiFixture(){
  const networkId='native512-laboratory';
  const inputOwners=Array.from({length:4},()=>createSpendIdentity512({networkId}));
  const outputOwners=Array.from({length:4},()=>createSpendIdentity512({networkId}));
  const value='9007199254740991',fee='100';
  const inputs=inputOwners.map(o=>createNote512({networkId,ownerTag:o.owner_tag,value}));
  const outputs=outputOwners.map((o,i)=>createNote512({networkId,ownerTag:o.owner_tag,
    value:i===3?(BigInt(value)-BigInt(fee)).toString():value}));
  const commitments=inputs.map(noteCommitment512);
  const tree=buildNoteTree512({networkId,commitments});
  const statement={
    version:RELATION_VERSION,network_id:networkId,asset_id:'QUEER',
    anchor_root:tree.root,anchor_leaf_count:commitments.length,
    input_commitments:commitments,output_commitments:outputs.map(noteCommitment512),
    nullifiers:inputs.map((note,i)=>nullifier512({note,spendSecret:inputOwners[i].spend_secret})),
    fee,transaction_binding:'ef'.repeat(64)};
  return {statement,witness:{
    inputs:inputs.map((note,i)=>({note,spend_secret:inputOwners[i].spend_secret,membership:tree.proof(i)})),
    outputs,
  }};
}

test('Plonky3 proves 53-bit conservation and binds a canonical SHA512 public statement, not SHA512 preimages',
{skip:!enabled,timeout:120000},()=>{
  assert.ok(binary?.startsWith('/'));
  const d=mkdtempSync(join(tmpdir(),'aegis-v4-financial53-'));
  try{
    for(const [index,opts] of [
      {leafCount:1},
      {leafCount:7,index:6},
      {leafCount:1,value:'9007199254740991',outputValue:'9007199254740990',fee:'1'},
      {multi:true}
    ].entries()){
      const f=opts.multi?multiFixture():native512Fixture(opts),files=makeFiles(d,f);
      // Overwrite private files without revealing inputs in logs.
      run('prove-financial-balance',files.privatePath,files.proofPath);
      const bundle=JSON.parse(readFileSync(files.proofPath,'utf8'));
      assert.equal(bundle.scheme,'AEGIS_V4_P3_FINANCIAL_AMOUNT53_PARTIAL_V1');
      assert.deepEqual(bundle.statement,f.statement);
      assert.equal(Object.hasOwn(bundle,'inputs'),false);
      assert.equal(Object.hasOwn(bundle,'outputs'),false);
      assert.equal(JSON.stringify(bundle).includes(f.witness.inputs[0].spend_secret),false);
      assert.equal(JSON.stringify(bundle).includes(f.witness.inputs[0].note.randomness),false);
      const verdict=JSON.parse(run('verify-financial-balance',files.proofPath,files.publicPath));
      assert.equal(verdict.valid,true,'genuine Plonky3 native amount proof must verify');
      assert.equal(verdict.statement_digest,financialStatementDigest512(f.statement),
        'native canonical SHA512 public statement framing must match JavaScript');
      assert.equal(verdict.amount_conservation_proved,true);
      assert.equal(verdict.financial_relation_proved,false);
      assert.equal(verdict.sha512_preimages_arithmetized,false);
      assert.equal(verdict.aegis_target_met,false);
      assert.equal(verdict.production_ready,false);
      assert.ok(bundle.proof.length>1000);
      const bytes=Buffer.from(bundle.proof,'base64');
      bytes[Math.floor(bytes.length/2)]^=1;
      const tampered={...bundle,proof:bytes.toString('base64')};
      const alteredPath=join(d,'altered'+index+'.json');
      writeFileSync(alteredPath,JSON.stringify(tampered));
      assert.equal(JSON.parse(run('verify-financial-balance',alteredPath,files.publicPath)).valid,false);
      for(const [j,mutate] of [
        x=>{x.fee=x.fee==='1'?'2':'1';},
        x=>{x.output_commitments[0]='aa'.repeat(64);},
        x=>{x.nullifiers[0]='bb'.repeat(64);},
        x=>{x.anchor_root='cc'.repeat(64);},
        x=>{x.network_id='different';},
      ].entries()){
        const changed=structuredClone(f.statement);mutate(changed);
        const alteredPublic=join(d,'public-'+index+'-'+j+'.json');
        writeFileSync(alteredPublic,JSON.stringify(changed));
        assert.equal(JSON.parse(run('verify-financial-balance',files.proofPath,alteredPublic)).valid,false);
      }
    }
  }finally{rmSync(d,{recursive:true,force:true});}
});

test('native financial prover rejects wrong owner, membership and forged amounts before proving',
{skip:!enabled,timeout:120000},()=>{
  assert.ok(binary?.startsWith('/'));
  const d=mkdtempSync(join(tmpdir(),'aegis-v4-financial53-negative-'));
  try{
    const f=native512Fixture({leafCount:3});
    for(const [i,change] of [
      x=>x.witness.inputs[0].spend_secret='00'.repeat(64),
      x=>x.witness.inputs[0].membership.siblings[0]='11'.repeat(64),
      x=>x.witness.outputs[0].value='104999901',
      x=>x.witness.outputs[0].value='9007199254740992',
    ].entries()){
      const altered=structuredClone(f);change(altered);
      const files=makeFiles(d,altered);
      assert.throws(()=>run('prove-financial-balance',files.privatePath,join(d,'fail-'+i+'.json')));
    }
  }finally{rmSync(d,{recursive:true,force:true});}
});
