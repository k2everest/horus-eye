import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inspect} from 'node:util';
import {P,ZERO,ONE,fromBase,add,sub,mul,pow,equal,fft,evalPolynomial,rootOfUnity} from '../fri/field.mjs';
import {decodeUniformChallenge512} from '../challenge-sampling.mjs';
import {MAX_AMOUNT,compileAmountCircuit,assignAmountWitness} from './amount-circuit.mjs';
import {buildPrivateAmountQap} from './amount-qap.mjs';

function onSubgroup(coefficients,n){
  const folded=Array.from({length:n},()=>ZERO);
  coefficients.forEach((coefficient,i)=>{folded[i%n]=add(folded[i%n],coefficient);});
  return fft(folded);
}
function scalarValue(terms,witness){let total=0n;for(const {wire,coefficient} of terms)total+=coefficient*witness[wire];return ((total%P)+P)%P;}
function randomOffDomain(n){
  for(let i=0;i<20;i++){
    const point=decodeUniformChallenge512(crypto.randomBytes(64));
    if(point&&!equal(pow(point,BigInt(n)),ONE))return point;
  }
  throw new Error('test failed to sample off-domain point');
}

test('masked QAP preserves every R1CS evaluation on H and zero-pads unused domain rows',()=>{
  const circuit=compileAmountCircuit({inputs:2,outputs:1,fee:'3'});
  const witness=assignAmountWitness(circuit,{inputValues:['5','7'],outputValues:['9']});
  const artifact=buildPrivateAmountQap(circuit,witness,{maskCoefficients:3});
  const {a,b,c}=artifact.polynomials,n=artifact.domainSize;
  assert.equal(circuit.constraints.length,166);assert.equal(n,256);
  const evaluated=[a,b,c].map(poly=>onSubgroup(poly,n));
  for(let i=0;i<n;i++){
    const expected=i<circuit.constraints.length?['A','B','C'].map(key=>fromBase(scalarValue(circuit.constraints[i][key],witness))):[ZERO,ZERO,ZERO];
    assert.deepEqual(evaluated.map(values=>values[i]),expected);
    assert.ok(equal(mul(evaluated[0][i],evaluated[1][i]),evaluated[2][i]));
  }
  // A direct point evaluation checks the reduction-to-subgroup test helper.
  let z=1n;const root=rootOfUnity(8);
  for(let i=0;i<3;i++){
    assert.deepEqual(evalPolynomial(a,fromBase(z)),evaluated[0][i]);z=z*root%P;
  }
});

test('off-domain polynomial identity checks FFT convolution and exact quotient division independently',()=>{
  for(const r of [1,5,129]){
    const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'1'});
    const witness=assignAmountWitness(circuit,{inputValues:['5'],outputValues:['4']});
    const artifact=buildPrivateAmountQap(circuit,witness,{maskCoefficients:r});
    const {a,b,c,quotient:q}=artifact.polynomials;
    assert.equal(a.length,artifact.domainSize+r);
    assert.equal(b.length,a.length);assert.equal(c.length,a.length);
    assert.equal(q.length,artifact.quotientDegreeBound);
    assert.equal(artifact.numeratorDegreeBound,2*(artifact.domainSize+r)-1);
    assert.ok(artifact.convolutionSize>=artifact.numeratorDegreeBound);
    assert.equal(artifact.convolutionSize&(artifact.convolutionSize-1),0);
    for(let i=0;i<4;i++){
      const z=randomOffDomain(artifact.domainSize);
      const left=sub(mul(evalPolynomial(a,z),evalPolynomial(b,z)),evalPolynomial(c,z));
      const right=mul(sub(pow(z,BigInt(artifact.domainSize)),ONE),evalPolynomial(q,z));
      assert.ok(equal(left,right));
    }
  }
});

test('fresh independent masks change private polynomials while public metadata and constraint values remain fixed',()=>{
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'0'});
  const witness=assignAmountWitness(circuit,{inputValues:['7'],outputValues:['7']});
  const a=buildPrivateAmountQap(circuit,witness,{maskCoefficients:2});
  const b=buildPrivateAmountQap(circuit,witness,{maskCoefficients:2});
  assert.deepEqual({...a},{...b});
  for(const key of ['a','b','c','quotient'])assert.notDeepEqual(a.polynomials[key],b.polynomials[key]);
  assert.notDeepEqual(a.polynomials.a,a.polynomials.b);
  assert.deepEqual(onSubgroup(a.polynomials.a,a.domainSize),onSubgroup(b.polynomials.a,b.domainSize));
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.polynomials)&&Object.isFrozen(a.polynomials.a));
});

test('maximum circuit and mask budgets fit a nonaliased bounded FFT and retain the identity',()=>{
  const circuit=compileAmountCircuit({inputs:4,outputs:4,fee:'0'}),max=MAX_AMOUNT.toString();
  const witness=assignAmountWitness(circuit,{inputValues:Array(4).fill(max),outputValues:Array(4).fill(max)});
  const artifact=buildPrivateAmountQap(circuit,witness,{maskCoefficients:1024});
  assert.equal(artifact.domainSize,512);assert.equal(artifact.convolutionSize,4096);
  const z=fromBase(3n),{a,b,c,quotient:q}=artifact.polynomials;
  assert.ok(equal(sub(mul(evalPolynomial(a,z),evalPolynomial(b,z)),evalPolynomial(c,z)),mul(sub(pow(z,512n),ONE),evalPolynomial(q,z))));
});

test('invalid witnesses, untrusted circuits and caller-selected masks are rejected before construction',()=>{
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'1'});
  const witness=assignAmountWitness(circuit,{inputValues:['5'],outputValues:['4']});
  const invalid=[...witness];invalid[1]=2n;
  const imbalance=assignAmountWitness(circuit,{inputValues:['10'],outputValues:['4']});
  for(const bad of [invalid,imbalance,[...witness,0n],null])assert.throws(()=>buildPrivateAmountQap(circuit,bad,{maskCoefficients:1}),/INVALID_AMOUNT_WITNESS/);
  assert.throws(()=>buildPrivateAmountQap({...circuit},witness,{maskCoefficients:1}),/INVALID_AMOUNT_WITNESS/);
  for(const options of [undefined,null,{},[],{maskCoefficients:0},{maskCoefficients:1025},{maskCoefficients:1.5},
    {maskCoefficients:1,randomCoefficients:[ONE]},{maskCoefficients:1,seed:'test'}])assert.throws(()=>buildPrivateAmountQap(circuit,witness,options),TypeError);
});

test('private polynomials do not appear in metadata, ordinary inspection or JSON',()=>{
  const circuit=compileAmountCircuit({inputs:1,outputs:1,fee:'0'});
  const witness=assignAmountWitness(circuit,{inputValues:['11'],outputValues:['11']});
  const artifact=buildPrivateAmountQap(circuit,witness,{maskCoefficients:1});
  assert.equal(inspect(artifact),'[PRIVATE amount QAP; not a proof]');
  assert.equal(inspect(artifact.polynomials),'[PRIVATE amount QAP polynomials; not a proof]');
  assert.throws(()=>JSON.stringify(artifact),/MUST_NOT_BE_SERIALIZED/);
  assert.throws(()=>JSON.stringify(artifact.polynomials),/MUST_NOT_BE_SERIALIZED/);
  assert.ok(!Object.keys(artifact).includes('polynomials'));
  assert.deepEqual(Object.keys(artifact.polynomials),[]);
  assert.throws(()=>artifact.polynomials.a.push(ZERO),TypeError);
});
