import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {BitCircuit,evaluateBitCircuit,bitConstraintRow,bitConstraintCount} from './bit-circuit.mjs';
import {preparePrivateBitQap,preparePrivateTransferQap,planBitQap} from './segmented-qap.mjs';
import {P,ONE,ZERO,fromBase,sub,mul,equal,evalPolynomial,rootOfUnity} from '../fri/field.mjs';
import {bindingDigest512} from '../bindings.mjs';
const budget={segmentRows:32,maxSegments:32,maskCoefficients:8};
const digest='ab'.repeat(64);
function fixture(){
  const b=new BitCircuit(),a=b.inputBytes('a',8),c=b.inputBytes('b',8);
  a.forEach((x,i)=>b.xor(b.and(x,c[i]),b.not(c[i])));
  const circuit=b.seal(),assignment=evaluateBitCircuit(circuit,{a:Buffer.alloc(8,0x69),b:Buffer.alloc(8,0x3c)});
  return {circuit,assignment};
}
test('every segment evaluates the trusted R1CS rows of one global snapshot with exact masked quotient',()=>{
  const {circuit,assignment}=fixture(),snapshot=assignment.values.slice(),prepared=preparePrivateBitQap(circuit,assignment,digest,budget);
  assert.equal(prepared.plan.constraints,bitConstraintCount(circuit));
  assert.equal(prepared.publicInputs.private_proof,false);assert.equal(prepared.publicInputs.aegis_target_met,false);
  const scalar=l=>fromBase(l.terms.reduce((s,t)=>(s+t.coefficient*BigInt(snapshot[t.wire]))%P,l.constant));
  const omega=fromBase(rootOfUnity(5));
  assignment.values.fill(0); // Never change already prepared segment witnesses.
  for(let s=0;s<prepared.plan.segments;s++){
    const artifact=prepared.segment(s),{a,b,c,quotient:q}=artifact.polynomials;let x=ONE;
    for(let i=0;i<32;i++){
      const j=s*32+i,row=j<bitConstraintCount(circuit)?bitConstraintRow(circuit,j):null;
      for(const [poly,key] of [[a,'A'],[b,'B'],[c,'C']])assert.ok(equal(evalPolynomial(poly,x),row?scalar(row[key]):ZERO));
      x=mul(x,omega);
    }
    const z=fromBase(7n);let zN=ONE;for(let i=0;i<32;i++)zN=mul(zN,z);
    assert.ok(!equal(zN,ONE));
    assert.ok(equal(sub(mul(evalPolynomial(a,z),evalPolynomial(b,z)),evalPolynomial(c,z)),mul(sub(zN,ONE),evalPolynomial(q,z))));
    assert.throws(()=>JSON.stringify(artifact),/PRIVATE/);assert.throws(()=>JSON.stringify(artifact.polynomials),/PRIVATE/);
    assert.ok(inspect(artifact).includes('PRIVATE'));assert.ok(Object.keys(artifact).every(k=>k!=='polynomials'));
  }
  assert.throws(()=>JSON.stringify(prepared),/PRIVATE/);assert.ok(!JSON.stringify(prepared.publicInputs).includes('values'));
  assert.throws(()=>prepared.segment(-1));assert.throws(()=>prepared.segment(prepared.plan.segments));
});
test('budgets fail before oversized work; invalid assignments and forged circuits cannot select independent witnesses',()=>{
  const {circuit,assignment}=fixture();
  const plan=planBitQap(circuit,{...budget,maxSegments:1});assert.equal(plan.withinBudget,false);
  assert.throws(()=>preparePrivateBitQap(circuit,assignment,digest,{...budget,maxSegments:1}),/BUDGET/);
  for(const opts of [undefined,{...budget,extra:1},{...budget,segmentRows:31},{...budget,segmentRows:2048},{...budget,maxSegments:0},{...budget,maskCoefficients:0}])assert.throws(()=>planBitQap(circuit,opts));
  const changed=assignment.values.slice();changed[100]^=1;
  assert.throws(()=>preparePrivateBitQap(circuit,changed,digest,budget),/INVALID/);
  assert.throws(()=>planBitQap({...circuit},budget));
  assert.throws(()=>preparePrivateTransferQap({circuit,statement_digest:digest},assignment,budget),/INVALID_TRANSFER/);
});
test('rebuilding a segment uses fresh masking while preserving source circuit and public statement binding',()=>{
  const {circuit,assignment}=fixture(),prepared=preparePrivateBitQap(circuit,assignment,digest,budget);
  const first=prepared.segment(0),again=prepared.segment(0);
  assert.notDeepEqual(first.polynomials.a,again.polynomials.a);
  assert.equal(prepared.publicInputs.statementDigest,digest);
  assert.match(prepared.publicInputs.circuitDigest,/^[0-9a-f]{128}$/);
  assert.match(prepared.publicInputs.witnessRoot,/^[0-9a-f]{128}$/);
  const {contextDigest,private_proof,aegis_target_met,production_ready,...context}=prepared.publicInputs;
  assert.equal(contextDigest,bindingDigest512({domain:'SEGMENTED_QAP_CONTEXT',parts:[Buffer.from(JSON.stringify(context))]}));
  assert.notEqual(contextDigest,bindingDigest512({domain:'SEGMENTED_QAP_CONTEXT',parts:[Buffer.from(JSON.stringify({...context,maskCoefficients:1}))]}));
  assert.throws(()=>preparePrivateBitQap(circuit,assignment,'ab'.repeat(32),budget),TypeError);
  assert.notEqual(prepared.publicInputs.witnessRoot,preparePrivateBitQap(circuit,assignment,'cd'.repeat(64),budget).publicInputs.witnessRoot);
});
