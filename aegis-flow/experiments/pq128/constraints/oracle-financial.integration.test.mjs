import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {BitCircuit,evaluateBitCircuit} from './bit-circuit.mjs';
import {privateRowOracle} from './private-row-oracle.mjs';
import {recoverBitWitnessFromOracles} from './oracle-extractor.mjs';
import {runFinancialOracleRehearsal} from './oracle-recovery-rehearsal.mjs';

test('synthetic row oracle snapshots its input, enforces single-pass access and disposal',()=>{
  const b=new BitCircuit(),input=b.inputBytes('x',1);input.forEach(x=>b.not(x));
  const circuit=b.seal(),assignment=evaluateBitCircuit(circuit,{x:Buffer.from([0xa5])});
  const expected=Uint8Array.from(assignment.values),source=privateRowOracle(circuit,assignment,{segmentRows:32,maxSegments:4});
  assignment.values.fill(0);
  const recovered=recoverBitWitnessFromOracles({circuit,statementDigest:'ab'.repeat(64),segmentRows:32,maskCoefficients:1,
    maxSegments:4,maxWires:128,oracleFormat:'domain-values',readSegment:i=>source.readSegment(i)});
  assert.deepEqual(recovered.values,expected);assert.equal(source.segmentsRead,source.segments);
  assert.throws(()=>source.readSegment(0),/ORDER_OR_DISPOSED/);
  assert.throws(()=>JSON.stringify(source),/PRIVATE/);
  source.dispose();recovered.dispose();assert.throws(()=>source.readSegment(source.segments),/DISPOSED/);
});

test('all financial circuit rows recover one common synthetic financial witness',{
  skip:process.env.AEGIS_ORACLE_FINANCIAL_RECOVERY!=='1',timeout:300000,
},t=>{
  const report=runFinancialOracleRehearsal();
  assert.ok(report.constraints_checked>6_000_000);
  assert.ok(report.wire_count>3_000_000);
  assert.equal(report.segments_read,Math.ceil(report.constraints_checked/report.segment_rows));
  assert.ok(Object.values(report.checks).every(value=>value===true));
  for(const field of ['receipt_extractor','knowledge_soundness_demonstrated','qap_identity_checked',
    'witness_commitment_binding_checked','private_proof','aegis_target_met','production_ready'])assert.equal(report[field],false);
  if(process.env.AEGIS_ORACLE_FINANCIAL_PUBLIC_ARTIFACT){
    writeFileSync(process.env.AEGIS_ORACLE_FINANCIAL_PUBLIC_ARTIFACT,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o644});
  }
  t.diagnostic(JSON.stringify(report));
});
