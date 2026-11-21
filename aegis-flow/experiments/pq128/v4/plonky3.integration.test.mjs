import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {journalDigestV4,programImageIdV4} from './hash512.mjs';
import {reviewCompositeV4} from './composite.mjs';
import {NativePlonky3V4Verifier} from './plonky3-backend.mjs';

const enabled=process.env.AEGIS_V4_P3_INTEGRATION==='1';
test('real Plonky3 native balance proof verifies a SHA-512-bound public claim; tampering fails',
  {skip:!enabled,timeout:120000},async()=>{
    const binary=process.env.AEGIS_V4_P3_BINARY;
    assert.ok(binary?.startsWith('/'),'absolute pinned native binary path required');
    const bytes=readFileSync(binary),program=programImageIdV4(bytes);
    const backend=new NativePlonky3V4Verifier({binaryPath:binary,expectedProgramId:program,
      expectedBinarySha512:crypto.createHash('sha512').update(bytes).digest('hex')});
    assert.equal(backend.available(),true);
    const {statement}=native512Fixture({leafCount:1});
    const claim={
      network_id:statement.network_id,program_id:program,index:0,segment_count:1,
      pre_state:'11'.repeat(64),post_state:'22'.repeat(64),
      journal_digest:journalDigestV4(statement),
    };
    const directory=mkdtempSync(join(tmpdir(),'aegis-v4-p3-test-'));
    try{
      const inFile=join(directory,'private.json'),proofFile=join(directory,'proof.json');
      // TEST DEMONSTRATION only: four positive u16 inputs and outputs plus fee.
      // The AIR does NOT enforce the SHA-512 financial note relation.
      const amounts=[70,30,0,0,50,40,0,0,10];
      writeFileSync(inFile,JSON.stringify({claim,amounts}),{mode:0o600});
      execFileSync(binary,['prove',inFile,proofFile],{timeout:90000,stdio:['ignore','pipe','pipe']});
      const bundle=readFileSync(proofFile);
      const parsed=JSON.parse(bundle);
      assert.equal(parsed.scheme,'AEGIS_V4_P3_BALANCE_SMOKE_V1');
      assert.equal(Object.hasOwn(parsed,'amounts'),false);
      const parameters={proofBytes:bundle,programId:program,networkId:statement.network_id,
        statementDigest:financialStatementDigest512(statement),segmentIndex:0,segmentCount:1};
      const checked=await backend.verifySegment(parameters);
      assert.equal(checked.valid,true);
      assert.deepEqual(checked.authenticated,claim);
      assert.equal(checked.financial_relation_proved,false);
      assert.equal(checked.production_ready,false);
      const expected={network_id:statement.network_id,program_id:program,
        initial_state:claim.pre_state,statement_digest:parameters.statementDigest,segment_count:1};
      const final=await reviewCompositeV4({statement,expected,segments:[{proof:bundle.toString('base64')}],backend});
      assert.equal(final.structurally_consistent,true);
      assert.equal(final.production_ready,false);
      // Untrusted metadata substitution, proof-byte corruption, wrong root,
      // different network, different transaction and a false program all fail.
      const altered=structuredClone(parsed);
      altered.claim.post_state='ff'.repeat(64);
      assert.equal((await backend.verifySegment({...parameters,proofBytes:Buffer.from(JSON.stringify(altered))})).valid,false);
      const corrupted=structuredClone(parsed);
      const raw=Buffer.from(corrupted.proof,'base64');raw[raw.length>>1]^=1;
      corrupted.proof=raw.toString('base64');
      assert.equal((await backend.verifySegment({...parameters,proofBytes:Buffer.from(JSON.stringify(corrupted))})).valid,false);
      assert.equal((await backend.verifySegment({...parameters,programId:'ff'.repeat(64)})).valid,false);
      assert.equal((await reviewCompositeV4({statement:{...statement,fee:'9'},expected,
        segments:[{proof:bundle.toString('base64')}],backend})).structurally_consistent,false);
      const invalidFile=join(directory,'unbalanced.json');
      writeFileSync(invalidFile,JSON.stringify({claim,amounts:[70,30,0,0,50,40,0,0,11]}),{mode:0o600});
      assert.throws(()=>execFileSync(binary,['prove',invalidFile,join(directory,'bad-proof.json')],{
        timeout:30000,stdio:['ignore','pipe','pipe']}));
    }finally{rmSync(directory,{recursive:true,force:true});}
  });
