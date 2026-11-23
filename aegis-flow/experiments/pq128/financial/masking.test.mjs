import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {inspect} from 'node:util';
import {P,ZERO,ONE,fromBase,add,sub,mul,pow,equal,fft,evalPolynomial,rootOfUnity} from '../fri/field.mjs';
import {maskTrace} from './masking.mjs';
const block=tuple=>{
  const n=tuple.reduce((sum,c,i)=>sum+c*P**BigInt(i),0n);
  return Buffer.from(n.toString(16).padStart(128,'0'),'hex');
};
const point=(logN,i)=>fromBase((()=>{let x=1n;const root=rootOfUnity(logN);for(let j=0;j<i;j++)x=x*root%P;return x;})());

test('masked coefficients match an independent polynomial convolution, including overlap when r>N',t=>{
  const n=4,r=6,source=[fromBase(3n),[1n,2n,3n,4n,5n],fromBase(7n),ZERO];
  const random=Array.from({length:r},(_,i)=>[BigInt(i+1),2n,3n,4n,5n]);let calls=0;
  t.mock.method(crypto,'randomBytes',size=>{assert.equal(size,64);return block(random[calls++]);});
  const artifact=maskTrace(fft(source),{maskCoefficients:r});
  const z=Array.from({length:n+1},(_,i)=>i===0?sub(ZERO,ONE):i===n?ONE:ZERO);
  const reference=Array.from({length:n+r},(_,i)=>source[i]??ZERO);
  for(let i=0;i<random.length;i++)for(let j=0;j<z.length;j++)reference[i+j]=add(reference[i+j],mul(random[i],z[j]));
  assert.deepEqual(artifact.coefficients,reference);assert.equal(calls,r);
  assert.deepEqual({...artifact},{originalDegreeBound:n,maskingDegreeBound:r,maskedDegreeBound:n+r,traceSize:n});
  assert.equal(artifact.coefficients.length,n+r);
});

test('fresh masking preserves every subgroup trace value and yields different private polynomials',()=>{
  for(const logN of [0,1,3,4]) {
    const n=2**logN,trace=Array.from({length:n},(_,i)=>[BigInt(i),BigInt(i+1),2n,3n,4n]);
    const original=structuredClone(trace),a=maskTrace(trace,{maskCoefficients:n+3}),b=maskTrace(trace,{maskCoefficients:n+3});
    assert.deepEqual(trace,original);assert.notDeepEqual(a.coefficients,b.coefficients);
    for(let i=0;i<n;i++) {
      assert.ok(equal(evalPolynomial(a.coefficients,point(logN,i)),trace[i]));
      assert.ok(equal(evalPolynomial(b.coefficients,point(logN,i)),trace[i]));
    }
    assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.coefficients));
  }
});

test('fixed off-domain evaluations are shifted by nonzero mask and on-domain evaluations are invariant',t=>{
  // A one-coefficient mask illustrates the diagonal scaling in the bounded
  // observation lemma. This is an algebraic test, not a test of full ZK.
  const r0=[2n,3n,4n,5n,6n],n=4;
  t.mock.method(crypto,'randomBytes',()=>block(r0));
  const source=[fromBase(7n),fromBase(9n),ZERO,ZERO],artifact=maskTrace(fft(source),{maskCoefficients:1});
  const z=fromBase(2n),vanishing=sub(pow(z,BigInt(n)),ONE);
  assert.ok(!equal(vanishing,ZERO));
  assert.ok(equal(sub(evalPolynomial(artifact.coefficients,z),evalPolynomial(source,z)),mul(vanishing,r0)));
});

test('random rejection is bounded, uses fresh CSPRNG draws and never falls back to biased modulo',t=>{
  let calls=0;
  t.mock.method(crypto,'randomBytes',()=>{calls++;return calls<4?Buffer.alloc(64,255):block([1n,2n,3n,4n,5n]);});
  assert.equal(maskTrace([ONE],{maskCoefficients:1}).coefficients.length,2);assert.equal(calls,4);
  t.mock.restoreAll();calls=0;
  t.mock.method(crypto,'randomBytes',()=>{calls++;return Buffer.alloc(64,255);});
  assert.throws(()=>maskTrace([ONE],{maskCoefficients:1}),/REJECTION_LIMIT/);assert.equal(calls,4);
});

test('private artifact redacts ordinary inspection and refuses accidental JSON serialization',()=>{
  const artifact=maskTrace([ONE,ZERO],{maskCoefficients:2});
  assert.throws(()=>JSON.stringify(artifact),/MUST_NOT_BE_SERIALIZED/);
  assert.equal(inspect(artifact),'[PRIVATE masked polynomial; not a proof]');
  assert.ok(!Object.keys(artifact).includes('coefficients'));
  assert.throws(()=>artifact.coefficients.push(ONE),TypeError);
});

test('invalid traces, excessive bounds and caller-selected randomness are rejected',()=>{
  for(const trace of [null,[],[ONE,ONE,ONE],Array(4097).fill(ONE),[[P,0n,0n,0n,0n]],[[1n,2n]],[[1,0n,0n,0n,0n]]])assert.throws(()=>maskTrace(trace,{maskCoefficients:1}),TypeError);
  for(const options of [undefined,null,{},[],{maskCoefficients:0},{maskCoefficients:1025},{maskCoefficients:1.1},
    {maskCoefficients:NaN},{maskCoefficients:1,seed:'caller'},{maskCoefficients:1,randomCoefficients:[ONE]}])assert.throws(()=>maskTrace([ONE],options),TypeError);
});
