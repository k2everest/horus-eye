// Uses the REAL independent Boolean compiler; no STARK proof is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  BitCircuit,evaluateBitCircuit,checkBitCircuit,
  snapshotBitWitness,bitCircuitPublicProgramBinary,
} from '../constraints/bit-circuit.mjs';
import {
  parseTrustedWiredProgram,buildSyntheticFullTrace,
  extractFromCompleteConsistentTrace,
} from './wired-full-oracle-extractor.mjs';
const sha=b=>createHash('sha512').update(b).digest('hex');

test('real BitCircuit program refines to the same complete-wiring relation',()=>{
  const b=new BitCircuit({maxGates:100});
  const wires=b.inputBytes('data',1);
  const and=b.and(wires[0],wires[1]);
  const xor=b.xor(wires[0],wires[1]);
  const not=b.not(wires[2]);
  b.assertEqual(and,not);
  b.assertEqual(xor,wires[2]);
  const circuit=b.seal();
  const assignment=evaluateBitCircuit(circuit,{data:Buffer.from([0b11000000])});
  assert.equal(checkBitCircuit(circuit,assignment),true);
  let bits;
  try{
    bits=snapshotBitWitness(circuit,assignment);
    const programBytes=bitCircuitPublicProgramBinary(circuit,{
      financialStatementDigest512:'22'.repeat(64),
    });
    const program=parseTrustedWiredProgram(programBytes,sha(programBytes));
    assert.equal(program.gate_count,circuit.gateCount);
    assert.equal(program.wire_count,circuit.wireCount);
    const rows=buildSyntheticFullTrace(program,bits);
    const result=extractFromCompleteConsistentTrace(program,rows);
    try{
      assert.deepEqual(result.privateWitnessBits,bits);
      assert.equal(result.reads_checked,3*circuit.gateCount);
      assert.equal(result.round_by_round_knowledge_proved,false);
      assert.equal(result.financial_relation_proved,false);
    }finally{result.dispose();rows.fill(0);}
  }finally{bits?.fill(0);assignment.values.fill(0);}
});