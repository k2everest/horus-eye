import test from 'node:test';
import assert from 'node:assert/strict';
import {P} from '../fri/field.mjs';
import {MAX_AMOUNT,compileAmountCircuit,assignAmountWitness,checkAmountWitness} from './amount-circuit.mjs';

// Independent evaluator reads emitted R1CS; it does not call the implementation
// checker or perform an input/output host sum as a substitute for constraints.
const evaluate=(terms,witness)=>{
  let total=0n;for(const term of terms)total+=term.coefficient*witness[term.wire];
  return ((total%P)+P)%P;
};
const failed=(circuit,witness)=>circuit.constraints.filter(({A,B,C})=>evaluate(A,witness)*evaluate(B,witness)%P!==evaluate(C,witness));
const independent=(circuit,witness)=>witness[0]===1n&&witness.length===circuit.witnessLength&&witness.every(x=>typeof x==='bigint'&&x>=0n&&x<P)&&failed(circuit,witness).length===0;

test('fixed public shape compiles genuine boolean, reconstruction, positivity and balance R1CS',()=>{
  const circuit=compileAmountCircuit({inputs:2,outputs:2,fee:'2'});
  const one=assignAmountWitness(circuit,{inputValues:['8','4'],outputValues:['7','3']});
  const other=assignAmountWitness(circuit,{inputValues:['10','8'],outputValues:['9','7']});
  assert.equal(checkAmountWitness(circuit,one),true);assert.equal(independent(circuit,one),true);
  assert.equal(checkAmountWitness(circuit,other),true);assert.equal(independent(circuit,other),true);
  assert.equal(circuit.witnessLength,221);assert.equal(circuit.constraints.length,221);
  assert.equal(circuit.constraints.filter(c=>c.kind==='boolean').length,212);
  const snapshot=JSON.stringify(circuit,(_,v)=>typeof v==='bigint'?v.toString():v);
  assert.equal(snapshot.includes('inputValues'),false);assert.equal(snapshot.includes('outputValues'),false);
  assert.equal(Object.isFrozen(circuit),true);assert.equal(Object.isFrozen(circuit.constraints[0].A[0]),true);
  assert.throws(()=>{circuit.shape.fee='0';},TypeError);
  assert.throws(()=>{one[0]=0n;},TypeError);
  assert.deepEqual(compileAmountCircuit({inputs:2,outputs:2,fee:'2'}),circuit);
});

test('nonboolean decomposition cannot bypass range even when reconstruction, positivity and balance hold',()=>{
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'0'});
  const witness=[...assignAmountWitness(circuit,{inputValues:['2'],outputValues:['2']})];
  const layout=circuit.wires[0];
  // Fake value2 as bit0=2 and bit1=0; reconstructs2 and has invertible sum2.
  witness[layout.bits[0]]=2n;witness[layout.bits[1]]=0n;
  witness[layout.inverse]=(P+1n)/2n;
  const broken=failed(circuit,witness);
  assert.equal(broken.length,1);assert.equal(broken[0].kind,'boolean');
  assert.equal(checkAmountWitness(circuit,witness),false);assert.equal(independent(circuit,witness),false);
});

test('range reconstruction prevents canonical field-wrap attacks and zero cannot satisfy positivity',()=>{
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'0'});
  const valid=assignAmountWitness(circuit,{inputValues:['1'],outputValues:['1']});
  const noncanonical=[...valid];noncanonical[circuit.wires[0].value]=P+1n;
  // Modular equations alone could accept p+1 as1. Canonical wire checks reject.
  assert.equal(failed(circuit,noncanonical).length,0);
  assert.equal(checkAmountWitness(circuit,noncanonical),false);
  const wrapped=[...valid];
  for(const layout of circuit.wires)wrapped[layout.value]=P-1n;
  assert.ok(failed(circuit,wrapped).some(c=>c.kind==='reconstruction'));
  assert.equal(checkAmountWitness(circuit,wrapped),false);
  const zero=[...valid];
  for(const layout of circuit.wires){for(const bit of layout.bits)zero[bit]=0n;zero[layout.value]=0n;}
  assert.deepEqual(failed(circuit,zero).map(c=>c.kind),['positive','positive']);
  assert.equal(checkAmountWitness(circuit,zero),false);
});

test('full integer ranges, maximum fee and four-amount totals do not wrap in Goldilocks',()=>{
  assert.ok(5n*MAX_AMOUNT<P);
  const max=MAX_AMOUNT.toString();
  const all=compileAmountCircuit({inputs:4,outputs:4,fee:'0'});
  const witness=assignAmountWitness(all,{inputValues:Array(4).fill(max),outputValues:Array(4).fill(max)});
  assert.equal(checkAmountWitness(all,witness),true);assert.equal(independent(all,witness),true);
  const fees=compileAmountCircuit({inputs:2,outputs:1,fee:max});
  const paid=assignAmountWitness(fees,{inputValues:[max,'1'],outputValues:['1']});
  assert.equal(checkAmountWitness(fees,paid),true);assert.equal(independent(fees,paid),true);
  const imbalance=assignAmountWitness(all,{inputValues:Array(4).fill(max),outputValues:Array(4).fill('1')});
  assert.deepEqual(failed(all,imbalance).map(c=>c.kind),['balance']);
  assert.equal(checkAmountWitness(all,imbalance),false);
});

test('public fee is independently compiled and forged relations or witness fields cannot authorize it',()=>{
  const publicShape={inputs:1,outputs:1,fee:'1'},circuit=compileAmountCircuit(publicShape);
  const witness=assignAmountWitness(circuit,{inputValues:['3'],outputValues:['2']});
  publicShape.fee='0';assert.equal(circuit.shape.fee,'1');
  const otherFee=compileAmountCircuit(publicShape);
  assert.equal(checkAmountWitness(otherFee,witness),false);
  assert.equal(checkAmountWitness({...circuit,shape:{...circuit.shape,fee:'0'}},witness),false);
  assert.equal(checkAmountWitness({...circuit,constraints:[]},witness),false);
  assert.equal(checkAmountWitness(circuit,[...witness,0n]),false);
  assert.equal(checkAmountWitness(circuit,witness.slice(1)),false);
  for(const bad of [0n,2n,P-1n]){const w=[...witness];w[0]=bad;assert.equal(checkAmountWitness(circuit,w),false);}
  for(const bad of [-1n,P,'1',1,undefined]){const w=[...witness];w[1]=bad;assert.equal(checkAmountWitness(circuit,w),false);}
  assert.throws(()=>assignAmountWitness({...circuit},{inputValues:['3'],outputValues:['2']}));
});

test('decimal encodings, shape counts and private assignment sizes are strict',()=>{
  for(const fee of ['-1','01','+1','1.0','1e1',' 1','',MAX_AMOUNT+1n,(MAX_AMOUNT+1n).toString()])assert.throws(()=>compileAmountCircuit({inputs:1,outputs:1,fee}));
  for(const count of [0,5,-1,1.5,'1',NaN])assert.throws(()=>compileAmountCircuit({inputs:count,outputs:1,fee:'0'}));
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'0'});
  for(const value of ['0','00','01','-1','+1','1.0','1e1',1n,1,MAX_AMOUNT+1n,(MAX_AMOUNT+1n).toString(),'1'.repeat(100)]){
    assert.throws(()=>assignAmountWitness(circuit,{inputValues:[value],outputValues:['1']}));
  }
  for(const values of [[],['1','2'],Array(1),null])assert.throws(()=>assignAmountWitness(circuit,{inputValues:values,outputValues:['1']}));
});
