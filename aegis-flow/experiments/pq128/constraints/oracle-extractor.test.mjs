import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {BitCircuit,evaluateBitCircuit,bitConstraintCount,bitConstraintRow,bitInputLayout} from './bit-circuit.mjs';
import {preparePrivateBitQap} from './segmented-qap.mjs';
import {recoverBitWitnessFromOracles} from './oracle-extractor.mjs';
import {P,ZERO,ONE,fromBase} from '../fri/field.mjs';
const digest='ab'.repeat(64),budget={segmentRows:32,maskCoefficients:8,maxSegments:32,maxWires:10000};
function fixture(){
  const b=new BitCircuit(),x=b.inputBytes('first',1);x.forEach(v=>b.not(v));
  const y=b.inputBytes('second',1);x.forEach((v,i)=>b.xor(v,y[i]));
  return b.seal();
}
function polynomialSource(circuit,assignment,opts=budget){
  const prepared=preparePrivateBitQap(circuit,assignment,digest,{segmentRows:opts.segmentRows,maskCoefficients:opts.maskCoefficients,maxSegments:opts.maxSegments});
  return Array.from({length:prepared.plan.segments},(_,i)=>{
    const s=prepared.segment(i),copy=p=>p.map(v=>[...v]);
    return {index:s.index,firstConstraint:s.firstConstraint,constraints:s.constraints,domainSize:s.domainSize,
      a:copy(s.polynomials.a),b:copy(s.polynomials.b),c:copy(s.polynomials.c)};
  });
}
function tableSource(circuit,values,n=32){
  const count=bitConstraintCount(circuit),scalar=l=>fromBase((l.constant+l.terms.reduce((sum,t)=>sum+t.coefficient*BigInt(values[t.wire]),0n))%P);
  return Array.from({length:Math.ceil(count/n)},(_,index)=>{
    const s={index,firstConstraint:index*n,constraints:Math.min(n,count-index*n),domainSize:n,a:[],b:[],c:[]};
    for(let i=0;i<n;i++){
      const row=index*n+i<count?bitConstraintRow(circuit,index*n+i):null;
      for(const [field,key] of [['a','A'],['b','B'],['c','C']])s[field].push(row?scalar(row[key]):ZERO);
    }return s;
  });
}
test('the public layout preserves input gaps introduced by gates',()=>{
  const circuit=fixture(),layout=bitInputLayout(circuit);
  assert.deepEqual(layout,[{name:'first',first:2,length:1},{name:'second',first:18,length:1}]);
  assert.equal(Object.isFrozen(layout),true);assert.equal(Object.isFrozen(layout[0]),true);
  assert.throws(()=>bitInputLayout({...circuit}));
});
test('one pass recovers the original assignment only from independent masked polynomial copies',()=>{
  const circuit=fixture(),assignment=evaluateBitCircuit(circuit,{first:Buffer.from([0xa5]),second:Buffer.from([0x3c])});
  const expected=Uint8Array.from(assignment.values),segments=polynomialSource(circuit,assignment),reads=segments.map(()=>0);
  assignment.values.fill(0);
  const recovered=recoverBitWitnessFromOracles({circuit,statementDigest:digest,...budget,readSegment:i=>{reads[i]++;return segments[i];}});
  assert.deepEqual(recovered.values,expected);assert.ok(reads.every(n=>n===1));
  const copy=recovered.values;copy.fill(0);assert.deepEqual(recovered.values,expected);
  assert.equal(recovered.constraintsChecked,bitConstraintCount(circuit));assert.equal(recovered.receipt_extractor,false);
  assert.equal(recovered.knowledge_soundness_demonstrated,false);assert.equal(recovered.qap_identity_checked,false);
  assert.equal(recovered.witness_commitment_binding_checked,false);assert.throws(()=>JSON.stringify(recovered),/PRIVATE/);
  assert.ok(inspect(recovered).includes('PRIVATE'));recovered.dispose();assert.throws(()=>recovered.values,/DISPOSED/);
});
test('masking with more coefficients than domain rows is removed by all exponent classes',()=>{
  const circuit=fixture(),assignment=evaluateBitCircuit(circuit,{first:Buffer.from([0x49]),second:Buffer.from([0x93])});
  const opts={...budget,maskCoefficients:70},segments=polynomialSource(circuit,assignment,opts);
  const r=recoverBitWitnessFromOracles({circuit,statementDigest:digest,...opts,readSegment:i=>segments[i]});
  assert.deepEqual(r.values,assignment.values);r.dispose();
});
test('locally valid segments from two assignments cannot select inconsistent global witnesses',()=>{
  const circuit=fixture(),one=evaluateBitCircuit(circuit,{first:Buffer.from([0]),second:Buffer.from([0])}),
    two=evaluateBitCircuit(circuit,{first:Buffer.from([255]),second:Buffer.from([255])});
  const a=polynomialSource(circuit,one),b=polynomialSource(circuit,two);
  assert.throws(()=>recoverBitWitnessFromOracles({circuit,statementDigest:digest,...budget,readSegment:i=>i===0?a[i]:b[i]}),/EXTRACTION_FAILED/);
});
test('coverage, padding, canonical fields, Booleanity and caller budgets fail closed',()=>{
  const circuit=fixture(),assignment=evaluateBitCircuit(circuit,{first:Buffer.from([0x31]),second:Buffer.from([0x72])});
  const original=tableSource(circuit,assignment.values),run=(segments,changes={})=>recoverBitWitnessFromOracles({circuit,statementDigest:digest,...budget,oracleFormat:'domain-values',readSegment:i=>segments[i],...changes});
  for(const mutate of [s=>{s[0].index=1;},s=>{s[1].firstConstraint++;},s=>{s[0].domainSize=64;},s=>{s[0].a[2]=fromBase(2n);},
    s=>{s[0].a[3]=[0n,1n,0n,0n,0n];},s=>{s[0].a[3]=[P,0n,0n,0n,0n];},
    s=>{s.at(-1).a.at(-1)[0]=1n;},s=>{s[0].a.pop();},s=>{s.splice(1,1);}]){
    const segments=structuredClone(original);mutate(segments);assert.throws(()=>run(segments),/EXTRACTION_FAILED/);
  }
  for(const changes of [{maxWires:2},{maxSegments:1},{statementDigest:'00'},{circuit:{...circuit}},{oracleFormat:'receipt'},{receipt:'not-an-oracle'}])assert.throws(()=>run(original,changes),/EXTRACTION_FAILED/);
  const r=run(original);assert.deepEqual(r.values,assignment.values);r.dispose();
});
test('a changing array length cannot bypass the oracle resource cap',()=>{
  const circuit=fixture(),assignment=evaluateBitCircuit(circuit,{first:Buffer.from([0x31]),second:Buffer.from([0x72])});
  const segments=tableSource(circuit,assignment.values);let reads=0;
  segments[0].a=new Proxy(segments[0].a,{get(target,key,receiver){
    if(key==='length')return ++reads===1?32:2**40;
    return Reflect.get(target,key,receiver);
  }});
  const recovered=recoverBitWitnessFromOracles({circuit,statementDigest:digest,...budget,oracleFormat:'domain-values',readSegment:i=>segments[i]});
  assert.equal(reads,1);assert.deepEqual(recovered.values,assignment.values);recovered.dispose();
});
