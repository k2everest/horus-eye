import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspect} from 'node:util';
import {
  parseTrustedWiredProgram,buildSyntheticFullTrace,
  extractFromCompleteConsistentTrace,algebraicFingerprintBound,
} from './wired-full-oracle-extractor.mjs';
const sha=b=>createHash('sha512').update(b).digest('hex');
const fixture=(financial=false,binding=Buffer.alloc(64,0x45))=>{
  const magic=Buffer.from(financial?'AEGIS_V4_BOOLEAN_PROGRAM_V2\0':
     'AEGIS_V4_BOOLEAN_PROGRAM_V1\0','ascii');
  const gates=[
    {op:1,a:2,b:3,z:4},
    {op:2,a:4,b:0,z:5},
    {op:3,a:0,b:0,z:6},
    {op:4,a:5,b:6,z:0},
  ];
  const head=Buffer.alloc(8);
  head.writeUInt32BE(8,0);head.writeUInt32BE(gates.length,4);
  const chunks=[magic,head];
  if(financial)chunks.push(binding);
  for(const g of gates){
    const bytes=Buffer.alloc(13);bytes[0]=g.op;
    bytes.writeUInt32BE(g.a,1);bytes.writeUInt32BE(g.b,5);bytes.writeUInt32BE(g.z,9);
    chunks.push(bytes);
  }
  const bytes=Buffer.concat(chunks);
  const program=parseTrustedWiredProgram(bytes,sha(bytes));
  const witness=Uint8Array.from([0,1,1,1,1,1,1,1]);
  return {bytes,program,witness,trace:buildSyntheticFullTrace(program,witness)};
};
test('full private rows yield one global Boolean assignment; remain private',()=>{
  const {program,trace,witness}=fixture();
  const result=extractFromCompleteConsistentTrace(program,trace);
  assert.deepEqual(result.privateWitnessBits,witness);
  assert.equal(result.reads_checked,12);
  assert.equal(result.exact_lookup_multiset_checked,true);
  assert.equal(result.quantum_extractor_constructed,false);
  assert.equal(result.round_by_round_knowledge_proved,false);
  assert.equal(result.pq128_demonstrated,false);
  assert.throws(()=>JSON.stringify(result),/PRIVATE_WITNESS_NOT_SERIALIZABLE/);
  assert.equal(inspect(result),'[PRIVATE_WIRED_WITNESS_REDACTED]');
  result.dispose();
  assert.ok(result.privateWitnessBits.every(x=>x===0));
});
test('rejects locally valid gate-row rebinding inconsistent with global wire table',()=>{
  const {program,trace}=fixture();
  trace[0]=0;trace[2]=0;
  assert.throws(()=>extractFromCompleteConsistentTrace(program,trace),/INCONSISTENT/);
});
test('rejects globally consistent but algebraically invalid gate',()=>{
  const {program,witness}=fixture();witness[4]=0;
  assert.throws(()=>extractFromCompleteConsistentTrace(program,
    buildSyntheticFullTrace(program,witness)),/INCONSISTENT/);
});
test('rejects nonbinary, false pin and nonzero padded gate rows',()=>{
  const {program,trace}=fixture();
  const nonbinary=Uint8Array.from(trace);nonbinary[3]=2;
  assert.throws(()=>extractFromCompleteConsistentTrace(program,nonbinary));
  const pin=Uint8Array.from(trace);pin[7]=0;
  assert.throws(()=>extractFromCompleteConsistentTrace(program,pin));
  const padding=Uint8Array.from(trace);padding[4*5]=1;
  assert.throws(()=>extractFromCompleteConsistentTrace(program,padding));
});
test('public receipt bytes or partial rows are not sufficient for extraction',()=>{
  const {program,trace}=fixture();
  assert.throws(()=>extractFromCompleteConsistentTrace(program,trace.subarray(0,16)));
  assert.throws(()=>extractFromCompleteConsistentTrace(program,Buffer.from('proof')));
});
test('requires independently pinned program SHA512, including statement binding',()=>{
  const x=fixture(true),y=fixture(true,Buffer.alloc(64,0x46));
  assert.notEqual(sha(x.bytes),sha(y.bytes));
  assert.throws(()=>parseTrustedWiredProgram(y.bytes,sha(x.bytes)));
  const extracted=extractFromCompleteConsistentTrace(y.program,y.trace);
  assert.equal(extracted.pq128_demonstrated,false);extracted.dispose();
});
test('rejects duplicate output and invalid opcode in trusted program decoder',()=>{
  const {bytes}=fixture();
  const start=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V1\0').length+8;
  const duplicate=Buffer.from(bytes);duplicate[start+13+12]=4;
  assert.throws(()=>parseTrustedWiredProgram(duplicate,sha(duplicate)));
  const bad=Buffer.from(bytes);bad[start]=99;
  assert.throws(()=>parseTrustedWiredProgram(bad,sha(bad)));
});
test('fixed-oracle algebraic fingerprint budget is not knowledge soundness',()=>{
  const result=algebraicFingerprintBound({gateCount:4,wireCount:8,fieldDegree:8});
  assert.equal(result.bound.numerator,'230');
  assert.equal(result.rbr_knowledge_proved,false);
  assert.equal(result.qrom_proved,false);
});