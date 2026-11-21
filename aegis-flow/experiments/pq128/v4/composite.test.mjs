import test from 'node:test';
import assert from 'node:assert/strict';
import {native512Fixture} from '../native/fixtures.mjs';
import {financialStatementDigest512} from '../financial/relation.mjs';
import {journalDigestV4,digestV4} from './hash512.mjs';
import {reviewCompositeV4,V4_CANDIDATE} from './composite.mjs';

function scenario(){
  const {statement}=native512Fixture({leafCount:1});
  const P='ab'.repeat(64),S0='11'.repeat(64),S1='22'.repeat(64),S2='33'.repeat(64);
  const p0=Buffer.from('first independently verified segment').toString('base64');
  const p1=Buffer.from('second independently verified segment').toString('base64');
  const journal=journalDigestV4(statement);
  const expected={network_id:statement.network_id,program_id:P,initial_state:S0,
    statement_digest:financialStatementDigest512(statement),segment_count:2};
  const signed=new Map([
    [p0,{network_id:statement.network_id,program_id:P,index:0,segment_count:2,
      pre_state:S0,post_state:S1,journal_digest:null}],
    [p1,{network_id:statement.network_id,program_id:P,index:1,segment_count:2,
      pre_state:S1,post_state:S2,journal_digest:journal}],
  ]);
  // TRUSTED MOCK ONLY: the map simulates validated output claims.
  // This test never asserts that its strings are cryptographic receipts.
  const backend={kind:'external-verified-512-bit-segment-claims',
    async verifySegment({proofBytes}) {
      const claim=signed.get(proofBytes.toString('base64'));
      return {valid:!!claim,authenticated:claim?structuredClone(claim):undefined};
    }};
  return {statement,expected,segments:[{proof:p0},{proof:p1}],backend,signed,p0,p1};
}
test('candidate contract binds full statement, initial state, program and chained authenticated segments',async()=>{
  const f=scenario(),r=await reviewCompositeV4(f);
  assert.equal(r.structurally_consistent,true);
  assert.match(r.composite_root,/^[0-9a-f]{128}$/);
  assert.equal(r.final_state,'33'.repeat(64));
  assert.equal(r.cryptographic_soundness_demonstrated,false);assert.equal(r.production_ready,false);
  assert.notEqual(V4_CANDIDATE,'RISC0-COMPOSITE-STARK-V1');
  assert.equal(r.journal_digest,journalDigestV4(f.statement));
});
test('no standalone source digest, stale statement, false program or wrong initial state can pass',async()=>{
  const f=scenario();
  for(const patch of [{program_id:'cd'.repeat(64)},{initial_state:'44'.repeat(64)},
    {statement_digest:'55'.repeat(64)},{segment_count:1},{program_id:'ab'.repeat(32)}]){
    const r=await reviewCompositeV4({...f,expected:{...f.expected,...patch}});
    assert.equal(r.structurally_consistent,false);
  }
  for(const mutation of [
    x=>x.statement.fee='2',
    x=>x.statement.transaction_binding='cd'.repeat(64),
    x=>x.statement.output_commitments[0]='cd'.repeat(64),
    x=>x.statement.extra='unauthenticated',
    x=>x.segments[0].proof='AAAA',
    x=>x.segments.reverse(),
    x=>x.segments[0].unknown='data',
  ]){
    const x={...f,statement:structuredClone(f.statement),segments:structuredClone(f.segments)};
    mutation(x);
    assert.equal((await reviewCompositeV4(x)).structurally_consistent,false);
  }
});
test('broken adjacent states, missing journal and missing external verifier are rejected',async()=>{
  const f=scenario();
  assert.equal((await reviewCompositeV4({...f,backend:null})).structurally_consistent,false);
  const original=f.signed.get(f.p1);
  f.signed.set(f.p1,{...original,pre_state:'ff'.repeat(64)});
  assert.equal((await reviewCompositeV4(f)).structurally_consistent,false);
  f.signed.set(f.p1,{...original,journal_digest:null});
  assert.equal((await reviewCompositeV4(f)).structurally_consistent,false);
  f.signed.set(f.p1,{...original,post_state:'ff'.repeat(32)});
  assert.equal((await reviewCompositeV4(f)).structurally_consistent,false);
});
test('saturating SHA-512 commitment is not a receipt: no segment verifier, no acceptance',async()=>{
  const f=scenario();
  const forged={...f,segments:[{proof:Buffer.from(digestV4('AEGIS_V4_TEST',[Buffer.from('data')])).toString('base64')}]};
  const r=await reviewCompositeV4(forged);
  assert.equal(r.structurally_consistent,false);
  assert.equal(r.cryptographic_soundness_demonstrated,false);
});

test('the full allowed 64-segment candidate chain has no fixed-size framing truncation',async()=>{
  const f=scenario(),count=64,program=f.expected.program_id;
  const proofs=[],lookup=new Map();
  let start=f.expected.initial_state;
  for(let i=0;i<count;i++){
    const end=(i+1).toString(16).padStart(128,'0'),p=Buffer.from('validated V4 segment '+i).toString('base64');
    proofs.push({proof:p});
    lookup.set(p,{network_id:f.statement.network_id,program_id:program,index:i,segment_count:count,
      pre_state:start,post_state:end,journal_digest:i===count-1?journalDigestV4(f.statement):null});
    start=end;
  }
  const backend={kind:'external-verified-512-bit-segment-claims',async verifySegment({proofBytes}){
    const claim=lookup.get(proofBytes.toString('base64'));
    return {valid:!!claim,authenticated:claim};
  }};
  const r=await reviewCompositeV4({statement:f.statement,expected:{...f.expected,segment_count:count},
    segments:proofs,backend});
  assert.equal(r.structurally_consistent,true);
  assert.equal(r.segments_verified_by_adapter,64);
  assert.match(r.composite_root,/^[0-9a-f]{128}$/);
  assert.equal(r.production_ready,false);
});
