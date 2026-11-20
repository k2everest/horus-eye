import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Native512LaboratoryBackend} from './backend.mjs';
import {native512Fixture} from './fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {noteCommitment512,createSpendIdentity512} from '../financial/notes.mjs';
import {StarkBackend} from '../../../services/proof-engine/backend.mjs';
const enabled=process.env.AEGIS_NATIVE512_INTEGRATION==='1';

test('fresh native receipt binds the entire SHA-512 relation without sending the witness to the verifier',
  {skip:!enabled,timeout:1320000},async()=>{
    const backend=new Native512LaboratoryBackend();assert.equal(backend.availableForProving(),true,'build the isolated guest first');
    const f=native512Fixture(),original=structuredClone(f),start=performance.now();
    const pending=backend.prove(f);
    // The native input and final expected journal must use the same snapshot.
    f.statement.transaction_binding='cd'.repeat(64);f.witness.outputs[0].value='1';
    const proof=await pending,elapsed=Math.round(performance.now()-start);
    const result=await backend.verify({statement:original.statement,proof});
    assert.equal(result.valid,true);assert.equal(result.aegis_target_met,false);assert.equal(result.production_ready,false);
    assert.ok(Buffer.from(proof.receipt,'base64').length>1000);
    for(const input of original.witness.inputs){assert.ok(!JSON.stringify(proof).includes(input.spend_secret));assert.ok(!JSON.stringify(proof).includes(input.note.randomness));}
    assert.equal((await backend.verify({statement:f.statement,proof})).valid,false);
    const changedOwner=createSpendIdentity512({networkId:original.statement.network_id});
    const changedOutput={...original.witness.outputs[0],owner_tag:changedOwner.owner_tag};
    for(const statement of [{...original.statement,fee:'101'},
      {...original.statement,output_commitments:[noteCommitment512(changedOutput)]},
      {...original.statement,transaction_binding:'ef'.repeat(64)}]){
      assert.equal((await backend.verify({statement,proof:{...proof,statement_digest:financialStatementDigest512(statement)}})).valid,false);
    }
    const bytes=Buffer.from(proof.receipt,'base64');bytes[Math.floor(bytes.length/2)]^=1;
    for(const bad of [{...proof,program_id:'00'.repeat(32)},{...proof,receipt:bytes.toString('base64')},
      {...proof,receipt:'fake'},{...proof,scheme:'RISC0-COMPOSITE-STARK-V1'}, {...proof,extra:true}])assert.equal((await backend.verify({statement:original.statement,proof:bad})).valid,false);
    const legacy=new StarkBackend();assert.equal((await legacy.verify({statement:original.statement,proof})).valid,false);
    for(const mutate of [
      x=>x.witness.inputs[0].spend_secret='00'.repeat(64),
      x=>x.witness.inputs[0].membership.leaf_index=3,
      x=>{x.witness.outputs[0].value='104999901';x.statement.output_commitments[0]=noteCommitment512(x.witness.outputs[0]);},
    ]){
      const bad=structuredClone(original);mutate(bad);await assert.rejects(()=>backend.prove(bad),/LABORATORY_NATIVE_OPERATION_FAILED/);
    }
    const root=fileURLToPath(new URL('../../../../',import.meta.url));
    const report={schema:'AEGIS_EXPERIMENT_NATIVE512_SMOKE_V1',source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
      statement:original.statement,proof,prover_elapsed_ms:elapsed,proof_size_bytes:Buffer.from(proof.receipt,'base64').length,
      outcome:'VERIFIED_LABORATORY_NATIVE_RECEIPT',engine_profile:'RISC0-3.1.0-LABORATORY',aegis_target_met:false,production_ready:false};
    const output=process.env.AEGIS_NATIVE512_PUBLIC_ARTIFACT;
    if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});
    // Log only public reproducibility metadata, never the witness or child stderr.
    const manifest=JSON.parse(readFileSync(fileURLToPath(new URL('../../../../work/native512/program.json',import.meta.url)),'utf8'));
    console.log(JSON.stringify({native512_program_id:manifest.program_id,source_sha256:manifest.source_sha256,prover_elapsed_ms:elapsed,
      proof_size_bytes:report.proof_size_bytes,aegis_target_met:false,production_ready:false}));
});
