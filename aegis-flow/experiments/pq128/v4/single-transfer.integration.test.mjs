import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
const binary=process.env.AEGIS_V4_P3_BINARY;
const run=(command,a,b)=>execFileSync(binary,[command,a,b],{
  timeout:90000,encoding:'utf8',maxBuffer:65536,stdio:['ignore','pipe','pipe']});
function files(dir,fixture,tag){
  const witness=join(dir,tag+'-private.json'),publicFile=join(dir,tag+'-public.json'),proof=join(dir,tag+'-proof.json');
  writeFileSync(witness,JSON.stringify({statement:fixture.statement,...fixture.witness}),{mode:0o600});
  writeFileSync(publicFile,JSON.stringify(fixture.statement),{mode:0o600});
  return {witness,publicFile,proof};
}

test('one-input-one-output Plonky3 proof checks 53-bit balance and verifier-side public one-leaf anchor',
  {skip:!enabled,timeout:120000},()=>{
    assert.ok(binary?.startsWith('/'));
    const dir=mkdtempSync(join(tmpdir(),'aegis-v4-single-transfer-'));
    try{
      for(const [i,opts] of [
        {leafCount:1},
        {leafCount:1,value:'9007199254740991',outputValue:'9007199254740990',fee:'1'},
      ].entries()){
        const f=native512Fixture(opts),p=files(dir,f,String(i));
        run('prove-single-transfer',p.witness,p.proof);
        const bundle=JSON.parse(readFileSync(p.proof,'utf8'));
        assert.equal(bundle.scheme,'AEGIS_V4_P3_FINANCIAL_AMOUNT53_PARTIAL_V1');
        assert.equal(Object.hasOwn(bundle,'inputs'),false);
        assert.equal(Object.hasOwn(bundle,'outputs'),false);
        assert.equal(JSON.stringify(bundle).includes(f.witness.inputs[0].spend_secret),false);
        assert.equal(JSON.stringify(bundle).includes(f.witness.inputs[0].note.randomness),false);
        const result=JSON.parse(run('verify-single-transfer',p.proof,p.publicFile));
        assert.equal(result.valid_balance,true);
        assert.equal(result.public_single_leaf_membership_verified,true);
        assert.equal(result.statement_digest,financialStatementDigest512(f.statement));
        assert.equal(result.private_note_commitment_proved,false);
        assert.equal(result.private_ownership_proved,false);
        assert.equal(result.private_nullifier_proved,false);
        assert.equal(result.financial_relation_proved,false);
        assert.equal(result.aegis_target_met,false);
        assert.equal(result.production_ready,false);
        const tampered=structuredClone(bundle);
        const bytes=Buffer.from(tampered.proof,'base64');bytes[bytes.length>>1]^=1;
        tampered.proof=bytes.toString('base64');
        const corrupt=join(dir,i+'-corrupt.json');writeFileSync(corrupt,JSON.stringify(tampered));
        assert.equal(JSON.parse(run('verify-single-transfer',corrupt,p.publicFile)).valid_balance,false);
        const changed=structuredClone(f.statement);changed.anchor_root='ff'.repeat(64);
        const wrongAnchor=join(dir,i+'-wrong-root.json');
        writeFileSync(wrongAnchor,JSON.stringify(changed));
        assert.equal(JSON.parse(run('verify-single-transfer',p.proof,wrongAnchor)).valid_balance,false);
      }
    }finally{rmSync(dir,{recursive:true,force:true});}
  });

test('one-input-one-output prover rejects false ownership, forged membership, unbalanced output and multi-leaf anchors',
  {skip:!enabled,timeout:120000},()=>{
    assert.ok(binary?.startsWith('/'));
    const dir=mkdtempSync(join(tmpdir(),'aegis-v4-single-invalid-'));
    try{
      for(const [i,edit] of [
        f=>{f.witness.inputs[0].spend_secret='00'.repeat(64);},
        f=>{f.witness.inputs[0].membership.commitment='ff'.repeat(64);},
        f=>{f.witness.outputs[0].value='104999901';},
        f=>{f.statement.nullifiers[0]='11'.repeat(64);},
        f=>{f.statement.anchor_root='aa'.repeat(64);},
      ].entries()){
        const f=native512Fixture({leafCount:1});edit(f);
        const p=files(dir,f,String(i));
        assert.throws(()=>run('prove-single-transfer',p.witness,p.proof));
      }
      const extra=native512Fixture({leafCount:2});const p=files(dir,extra,'two-leaves');
      assert.throws(()=>run('prove-single-transfer',p.witness,p.proof));
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
