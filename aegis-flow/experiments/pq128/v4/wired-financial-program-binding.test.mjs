import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BitCircuit,bitCircuitPublicProgramBinary} from '../constraints/bit-circuit.mjs';
const hash=bytes=>createHash('sha512').update(bytes).digest('hex');

test('financial V2 R1CS program binds identical gate program to the exact authenticated statement',()=>{
  const b=new BitCircuit({maxGates:32});
  const input=b.inputBytes('input',1);
  const wire=b.xor(input[0],input[1]);
  b.assertEqual(wire,b.one);
  const circuit=b.seal();
  const original='ab'.repeat(64),changed='cd'.repeat(64);
  const p1=bitCircuitPublicProgramBinary(circuit,{financialStatementDigest512:original});
  const p2=bitCircuitPublicProgramBinary(circuit,{financialStatementDigest512:changed});
  const magic=Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V2\0','ascii');
  assert.equal(p1.subarray(0,magic.length).toString('hex'),magic.toString('hex'));
  assert.equal(p1.length,p2.length);
  assert.equal(p1.readUInt32BE(magic.length),circuit.wireCount);
  assert.equal(p1.readUInt32BE(magic.length+4),circuit.gateCount);
  assert.equal(p1.subarray(magic.length+8,magic.length+72).toString('hex'),original);
  assert.equal(p2.subarray(magic.length+8,magic.length+72).toString('hex'),changed);
  assert.deepEqual(p1.subarray(magic.length+72),p2.subarray(magic.length+72));
  assert.notEqual(hash(p1),hash(p2));
  assert.throws(()=>bitCircuitPublicProgramBinary(circuit,{financialStatementDigest512:'garbage'}));
  assert.throws(()=>bitCircuitPublicProgramBinary(circuit,{financialStatementDigest512:original.toUpperCase()}));
  assert.ok(bitCircuitPublicProgramBinary(circuit).includes(Buffer.from('AEGIS_V4_BOOLEAN_PROGRAM_V1\0')));
});
