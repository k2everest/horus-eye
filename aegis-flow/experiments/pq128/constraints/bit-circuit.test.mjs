import test from 'node:test';
import assert from 'node:assert/strict';
import {inspect} from 'node:util';
import {createHash} from 'node:crypto';
import {P} from '../fri/field.mjs';
import {BitCircuit,evaluateBitCircuit,checkBitCircuit,readBitBytes,evaluateGateConstraint,
  bitConstraintCount,bitConstraintRow,snapshotBitWitness,bitCircuitDigest512} from './bit-circuit.mjs';

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

const field=value=>{const r=value%P;return r<0n?r+P:r;};
function publicRowHolds(row,values){
  const linear=lc=>field(lc.constant+lc.terms.reduce((sum,t)=>sum+t.coefficient*BigInt(values[t.wire]),0n));
  return field(linear(row.A)*linear(row.B)-linear(row.C))===0n;
}
test('lazy public R1CS rows independently agree with Boolean checker, pins and every gate truth row',()=>{
  const b=new BitCircuit(),bits=b.inputBytes('data',1),a=bits[0],c=bits[1];
  const product=b.and(a,c),different=b.xor(a,c);b.not(a);b.assertEqual(product,different);
  const circuit=b.seal(),count=bitConstraintCount(circuit);
  assert.equal(count,2+circuit.wireCount+circuit.gateCount);
  const rows=Array.from({length:count},(_,i)=>bitConstraintRow(circuit,i));
  for(const av of [0,1])for(const cv of [0,1]){
    const w=evaluateBitCircuit(circuit,{data:Buffer.from([(av<<7)|(cv<<6)])});
    assert.equal(rows.every(row=>publicRowHolds(row,w.values)),checkBitCircuit(circuit,w));
    for(let wire=0;wire<circuit.wireCount;wire++){
      const changed=w.values.slice();changed[wire]^=1;
      assert.equal(rows.every(row=>publicRowHolds(row,changed)),checkBitCircuit(circuit,changed));
    }
    const nonboolean=w.values.slice();nonboolean[bits[2]]=2;
    assert.equal(rows.every(row=>publicRowHolds(row,nonboolean)),false);
  }
  const valid=evaluateBitCircuit(circuit,{data:Buffer.alloc(1)});
  for(const [wire,value] of [[0,1],[1,0]]){
    const changed=valid.values.slice();changed[wire]=value;
    assert.equal(publicRowHolds(rows[wire],changed),false);
  }
  const fieldAttack=Array.from(valid.values,BigInt);fieldAttack[bits[3]]=P-1n;
  assert.equal(publicRowHolds(rows[2+bits[3]],fieldAttack),false);
  for(const row of rows){
    assert.ok(Object.isFrozen(row));
    for(const lc of [row.A,row.B,row.C]){
      assert.ok(Object.isFrozen(lc)&&Object.isFrozen(lc.terms));assert.ok(lc.constant>=0n&&lc.constant<P);
      let last=-1;for(const term of lc.terms){assert.ok(Object.isFrozen(term));assert.ok(term.wire>last);last=term.wire;assert.ok(term.coefficient>0n&&term.coefficient<P);}
    }
  }
  assert.throws(()=>{rows[0].A.terms[0].coefficient=9n;});
  for(const i of [-1,count,Infinity,1.5,'0',0n])assert.throws(()=>bitConstraintRow(circuit,i));
  assert.throws(()=>bitConstraintCount({...circuit}));
});

test('private witness snapshots copy first and validate only canonical bits and pins',()=>{
  const b=new BitCircuit(),bits=b.inputBytes('data',1),output=b.not(bits[0]),c=b.seal();
  const assignment=evaluateBitCircuit(c,{data:Buffer.alloc(1)}),snapshot=snapshotBitWitness(c,assignment);
  assert.ok(snapshot instanceof Uint8Array);assert.notEqual(snapshot,assignment.values);
  snapshot[bits[1]]=1;assert.equal(assignment.values[bits[1]],0);
  assignment.values[bits[2]]=1;assert.equal(snapshot[bits[2]],0);
  const wrong=assignment.values.slice();wrong[output]^=1;
  // Gate checks are deliberately separate; a canonical but invalid assignment
  // remains available for a later constraint/polynomial checker to reject.
  assert.doesNotThrow(()=>snapshotBitWitness(c,wrong));assert.equal(checkBitCircuit(c,wrong),false);
  for(const [wire,value] of [[0,1],[1,0],[bits[3],2]]){const invalid=assignment.values.slice();invalid[wire]=value;assert.throws(()=>snapshotBitWitness(c,invalid));}
  assert.throws(()=>snapshotBitWitness(c,assignment.values.slice(1)));
  assert.throws(()=>snapshotBitWitness({...c},assignment));
});

test('canonical circuit digest streams exact public mapping and populated gate records, never witness bytes',()=>{
  function compile(maxGates=1024){
    const b=new BitCircuit({maxGates}),v=b.inputBytes('data',1),a=b.and(v[0],v[1]),x=b.xor(v[0],v[1]);b.not(v[0]);b.assertEqual(a,x);return b.seal();
  }
  const c=compile(),small=compile(4),digest=bitCircuitDigest512(c);
  assert.match(digest,/^[0-9a-f]{128}$/);assert.equal(bitCircuitDigest512(small),digest);
  const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
  const frame=b=>Buffer.concat([u32(b.length),b]);
  const prime=Buffer.alloc(8);prime.writeBigUInt64BE(P);
  const record=(op,a,b,z)=>Buffer.concat([Buffer.from([op]),u32(a),u32(b),u32(z)]);
  const bytes=Buffer.concat([
    Buffer.from('AEGIS_EXPERIMENT_BIT_CIRCUIT_DIGEST512_V1\0','ascii'),frame(prime),frame(Buffer.from('AEGIS_EXPERIMENT_BIT_R1CS_V1')),
    frame(Buffer.from('PINS:w0=0,w1=1;BOOL:w*(w-1)=0;AND:a*b=z;XOR:(2*a)*b=a+b-z;NOT:(1-a)*1=z;EQ:(a-b)*1=0')),
    u32(13),u32(4),u32(1),u32(13),frame(Buffer.from('data')),u32(1),u32(2),
    record(1,2,3,10),record(2,2,3,11),record(3,2,0,12),record(4,10,11,0),Buffer.from('END_BIT_CIRCUIT_V1\0','ascii'),
  ]);
  assert.equal(digest,createHash('sha512').update(bytes).digest('hex'));
  for(const message of [0,255]){const witness=evaluateBitCircuit(c,{data:Buffer.from([message])});witness.values.fill(1);assert.equal(bitCircuitDigest512(c),digest);}
  const single=(operation,name='data',reverse=false)=>{const b=new BitCircuit(),v=b.inputBytes(name,1);b[operation](v[reverse?1:0],v[reverse?0:1]);return b.seal();};
  const and=single('and');
  for(const different of [single('xor'),single('and','other'),single('and','data',true)])assert.notEqual(bitCircuitDigest512(and),bitCircuitDigest512(different));
  const interleaved=new BitCircuit(),a=interleaved.inputBytes('a',1);interleaved.not(a[0]);interleaved.inputBytes('b',1);
  const together=new BitCircuit(),aa=together.inputBytes('a',1);together.inputBytes('b',1);together.not(aa[0]);
  assert.notEqual(bitCircuitDigest512(interleaved.seal()),bitCircuitDigest512(together.seal()));
  assert.throws(()=>bitCircuitDigest512({...c}));
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
