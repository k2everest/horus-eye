import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {BitCircuit,evaluateBitCircuit,checkBitCircuit,readBitBytes,evaluateGateConstraint} from './bit-circuit.mjs';

test('actual Boolean gates satisfy arithmetic R1CS equations for every truth-table row',()=>{
  const builder=new BitCircuit(),input=builder.inputBytes('data',1);
  const a=input[0],b=input[1],and=builder.and(a,b),xor=builder.xor(a,b),not=builder.not(a);
  const circuit=builder.seal();
  assert.equal(circuit.gateCount,3);assert.equal(circuit.wireCount,13);
  for(const av of [0,1])for(const bv of [0,1]){
    const assignment=evaluateBitCircuit(circuit,{data:Buffer.from([(av<<7)|(bv<<6)])}),v=assignment.values;
    assert.equal(v[and],av*bv);assert.equal(v[xor],av+bv-2*av*bv);assert.equal(v[not],1-av);
    assert.equal(checkBitCircuit(circuit,assignment),true);assert.equal(checkBitCircuit(circuit,v),true);
    assert.equal(v[a]*v[b]-v[and],0);assert.equal(v[a]+v[b]-2*v[a]*v[b]-v[xor],0);assert.equal(1-v[a]-v[not],0);
    for(let i=0;i<3;i++)assert.equal(evaluateGateConstraint(circuit,v,i),0);
    for(const wire of [and,xor,not]){const tampered=Uint8Array.from(v);tampered[wire]^=1;assert.equal(checkBitCircuit(circuit,tampered),false);}
  }
});

test('constant bytes and named private bytes use MSB-first wires without input aliasing',()=>{
  const builder=new BitCircuit(),input=builder.inputBytes('message',2),constant=builder.constantBytes(Buffer.from('ab12','hex'));
  assert.deepEqual(constant,[1,0,1,0,1,0,1,1,0,0,0,1,0,0,1,0]);
  const circuit=builder.seal(),source=Buffer.from('80f1','hex'),assignment=evaluateBitCircuit(circuit,{message:source});
  assert.equal(readBitBytes(circuit,assignment,input).toString('hex'),'80f1');
  assert.equal(readBitBytes(circuit,assignment,constant).toString('hex'),'ab12');
  source.fill(0);assert.equal(readBitBytes(circuit,assignment,input).toString('hex'),'80f1');
  const extracted=readBitBytes(circuit,assignment,input);extracted.fill(0);
  assert.equal(readBitBytes(circuit,assignment,input).toString('hex'),'80f1');
});

test('assertEqual is a checked equation and constant-fold identities allocate no unnecessary gates',()=>{
  const builder=new BitCircuit(),a=builder.inputBytes('a',1),b=builder.inputBytes('b',1);
  assert.equal(builder.and(a[0],builder.one),a[0]);assert.equal(builder.and(a[0],builder.zero),builder.zero);
  assert.equal(builder.and(a[0],a[0]),a[0]);assert.equal(builder.xor(a[0],a[0]),builder.zero);
  assert.equal(builder.xor(a[0],builder.zero),a[0]);assert.equal(builder.not(builder.zero),builder.one);
  assert.equal(builder.not(builder.one),builder.zero);
  for(let i=0;i<8;i++)builder.assertEqual(a[i],b[i]);
  builder.assertEqual(builder.zero,builder.zero);
  const circuit=builder.seal();assert.equal(circuit.gateCount,8);
  assert.equal(checkBitCircuit(circuit,evaluateBitCircuit(circuit,{a:Buffer.from([5]),b:Buffer.from([5])})),true);
  const assignment=evaluateBitCircuit(circuit,{a:Buffer.from([5]),b:Buffer.from([4])});
  assert.equal(checkBitCircuit(circuit,assignment),false);
  assert.equal(evaluateGateConstraint(circuit,assignment,7),1);
  const impossible=new BitCircuit();impossible.assertEqual(impossible.zero,impossible.one);
  const contradiction=impossible.seal();assert.equal(checkBitCircuit(contradiction,evaluateBitCircuit(contradiction,{})),false);
});

test('all witness wires are Boolean and constants are fixed even when wires are unused',()=>{
  const builder=new BitCircuit(),bits=builder.inputBytes('a',1),circuit=builder.seal();
  const assignment=evaluateBitCircuit(circuit,{a:Buffer.alloc(1)});
  for(const wire of [0,1,...bits]){
    const values=Uint8Array.from(assignment.values);values[wire]=2;assert.equal(checkBitCircuit(circuit,values),false);
  }
  for(const [wire,value] of [[0,1],[1,0]]){const values=Uint8Array.from(assignment.values);values[wire]=value;assert.equal(checkBitCircuit(circuit,values),false);}
  assert.equal(checkBitCircuit(circuit,assignment.values.slice(1)),false);
  assert.equal(checkBitCircuit({...circuit,gateCount:0},assignment),false);
  assert.equal(checkBitCircuit(circuit,{values:assignment.values}),false);
  assert.equal(checkBitCircuit(circuit,Array.from(assignment.values)),false);
  const bad=Uint8Array.from(assignment.values);bad[bits[0]]=2;
  assert.throws(()=>readBitBytes(circuit,bad,bits));
});

test('gate, byte, name and wire bounds are enforced before folding; seal forbids all mutations',()=>{
  for(const options of [{maxGates:0},{maxGates:8_000_001},{maxInputBytes:0},{maxInputBytes:262145}])assert.throws(()=>new BitCircuit(options));
  const builder=new BitCircuit({maxGates:2,maxInputBytes:1}),bits=builder.inputBytes('a',1);
  assert.throws(()=>builder.inputBytes('a',0));assert.throws(()=>builder.inputBytes('b',1));
  assert.throws(()=>builder.inputBytes('__proto__',0));
  for(const bad of [-1,10,Infinity,1.5,'2']){
    assert.throws(()=>builder.xor(bad,bad));assert.throws(()=>builder.and(builder.zero,bad));
    assert.throws(()=>builder.not(bad));assert.throws(()=>builder.assertEqual(bad,bad));
  }
  builder.and(bits[0],bits[1]);builder.xor(bits[0],bits[1]);assert.throws(()=>builder.not(bits[0]),/budget/);
  const circuit=builder.seal();
  for(const operation of [()=>builder.seal(),()=>builder.inputBytes('empty',0),()=>builder.constantBytes(Buffer.alloc(0)),
    ()=>builder.xor(builder.zero,builder.zero),()=>builder.and(bits[0],bits[0]),()=>builder.not(builder.one),()=>builder.assertEqual(bits[0],bits[0])])assert.throws(operation,/sealed/);
  assert.ok(Object.isFrozen(circuit)&&Object.isFrozen(circuit.inputByteLengths));
  const assignment=evaluateBitCircuit(circuit,{a:Buffer.alloc(1)});
  for(const wires of [[bits[0]],[...bits.slice(1),100],Array(8)])assert.throws(()=>readBitBytes(circuit,assignment,wires));
  assert.throws(()=>evaluateGateConstraint(circuit,assignment,2));
});

test('growing compact typed stores, interleaved inputs and exact named-input schemas work',()=>{
  const builder=new BitCircuit({maxGates:2200}),a=builder.inputBytes('a',1);
  let wire=a[0];for(let i=0;i<1100;i++)wire=builder.not(wire);
  const b=builder.inputBytes('b',1);builder.assertEqual(wire,b[0]);
  const circuit=builder.seal(),assignment=evaluateBitCircuit(circuit,{a:new Uint8Array([128]),b:Buffer.from([128])});
  assert.equal(circuit.gateCount,1101);assert.equal(checkBitCircuit(circuit,assignment),true);
  for(const inputs of [null,[],{},Object.create({a:Buffer.alloc(1),b:Buffer.alloc(1)}),
    {a:Buffer.alloc(2),b:Buffer.alloc(1)},{a:'00',b:Buffer.alloc(1)},
    {a:Buffer.alloc(1),b:Buffer.alloc(1),extra:Buffer.alloc(0)}])assert.throws(()=>evaluateBitCircuit(circuit,inputs));
});

test('private assignments hide values from ordinary inspection and reject JSON serialization',()=>{
  const builder=new BitCircuit();builder.inputBytes('secret',1);const circuit=builder.seal();
  const assignment=evaluateBitCircuit(circuit,{secret:Buffer.from([71])});
  assert.ok(Object.isFrozen(assignment));assert.equal(Object.keys(assignment).includes('values'),false);
  assert.equal(inspect(assignment),'[PRIVATE bit assignment; not a proof]');
  assert.throws(()=>JSON.stringify(assignment),/MUST_NOT_BE_SERIALIZED/);
});
