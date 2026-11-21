import test from 'node:test';
import assert from 'node:assert/strict';
import {P, W, ZERO, ONE, fromBase, assertElement, add, sub, mul, scale, inv, pow,
  equal, encodeElement, decodeElement, rootOfUnity, fft, evalPolynomial} from './field.mjs';

const normalize = n => ((n % P) + P) % P;
function baseExponent(a, n, modulus = P) {
  let result = 1n;
  for (; n > 0n; n /= 2n, a = a * a % modulus) if (n % 2n) result = result * a % modulus;
  return result;
}
// Separate quotient-ring reference: reduce each monomial before accumulating,
// rather than constructing and reducing the complete product polynomial.
function referenceProduct(a, b) {
  const result = [0n, 0n, 0n, 0n, 0n];
  a.forEach((x, i) => b.forEach((y, j) => {
    const degree = i + j;
    result[degree % 5] = normalize(result[degree % 5] + x * y * (degree >= 5 ? W : 1n));
  }));
  return result;
}

test('Goldilocks prime and binomial degree-five irreducibility prerequisites hold', () => {
  assert.equal(P,18446744069414584321n);
  assert.equal((P - 1n) % 5n,0n);
  assert.notEqual(baseExponent(W,(P-1n)/5n),1n);
  // Deterministic Miller-Rabin bases for unsigned 64-bit integers.
  let odd = P - 1n, s = 0;
  while (odd % 2n === 0n) { odd /= 2n; s++; }
  for (const a of [2n,325n,9375n,28178n,450775n,9780504n,1795265022n]) {
    let x = baseExponent(a % P,odd);
    if (x === 1n || x === P - 1n) continue;
    let witness = true;
    for (let r = 1; r < s; r++) { x = x*x%P; if (x === P-1n) { witness=false;break; } }
    assert.equal(witness,false,`compositeness witness ${a}`);
  }
  const x = [0n,1n,0n,0n,0n];
  assert.deepEqual(pow(x,5n),fromBase(W));
  assert.deepEqual(pow(x,P ** 5n),x);
});

test('extension multiplication matches independent monomial reduction and satisfies inverse laws', () => {
  const vectors = [ZERO,ONE,[0n,1n,0n,0n,0n],[1n,2n,3n,4n,5n],
    [P-1n,P-2n,P-3n,P-4n,P-5n],[31n,0n,42n,0n,83n]];
  for (const a of vectors) for (const b of vectors) {
    assert.deepEqual(mul(a,b),referenceProduct(a,b));
    assert.deepEqual(sub(add(a,b),b),a);
    assert.deepEqual(mul(a,b),mul(b,a));
    assert.deepEqual(scale(a,-3n),mul(a,fromBase(-3n)));
    assert.deepEqual(mul(a,add(b,ONE)),add(mul(a,b),a));
  }
  for (const a of vectors.slice(1)) assert.deepEqual(mul(a,inv(a)),ONE);
  assert.throws(()=>inv(ZERO),/zero/);
  assert.throws(()=>pow(ONE,-1n),/nonnegative/);
  assert.throws(()=>pow(ONE,2),/bigint/);
  assert.deepEqual(pow(ZERO,0n),ONE);
  assert.equal(equal(fromBase(P+2n),fromBase(2n)),true);
});

test('field encoding is exact, canonical, immutable and independent of input buffers', () => {
  const a = [1n,0x0102030405060708n,P-1n,0n,5n], original=[...a];
  const encoded=encodeElement(a);
  assert.equal(encoded.length,40);
  assert.equal(encoded.subarray(8,16).toString('hex'),'0102030405060708');
  const decoded=decodeElement(encoded);
  assert.deepEqual(decoded,a);
  encoded.fill(0);
  assert.deepEqual(decoded,a);
  for (const operation of [()=>add(a,ONE),()=>sub(a,ONE),()=>mul(a,ONE),()=>scale(a,1n),()=>pow(a,0n)]) operation();
  assert.deepEqual(a,original);
  assert.throws(()=>{ decoded[0]=2n; },TypeError);
  assert.throws(()=>{ ZERO[0]=2n; },TypeError);
  assert.throws(()=>{ ONE[0]=2n; },TypeError);
  assert.notEqual(fromBase(0n),ZERO);
  for(const bad of [[0n],Array(5).fill(0),[P,0n,0n,0n,0n],[-1n,0n,0n,0n,0n]]) assert.throws(()=>assertElement(bad));
  for(const bad of [Buffer.alloc(39),Buffer.alloc(41),new Uint8Array(40),'00'.repeat(40)]) assert.throws(()=>decodeElement(bad));
  const noncanonical=Buffer.alloc(40);noncanonical.writeBigUInt64BE(P,0);
  assert.throws(()=>decodeElement(noncanonical),/canonical/);
});

test('roots have exact power-of-two order throughout the supported field range', () => {
  for (let logN=0;logN<=32;logN++) {
    const root=rootOfUnity(logN),n=1n<<BigInt(logN);
    assert.equal(baseExponent(root,n),1n);
    if(logN)assert.notEqual(baseExponent(root,n/2n),1n);
  }
  for(const bad of [-1,33,1.5,NaN,'4'])assert.throws(()=>rootOfUnity(bad));
});

test('FFT evaluations match direct polynomial sums and inverse interpolation round trips', () => {
  for (const n of [1,2,4,8,16,32]) {
    const coefficients=Array.from({length:n},(_,i)=>[BigInt(i+1),BigInt(i*i+1),0n,BigInt(i%3),P-1n]);
    const original=coefficients.map(v=>[...v]),evaluations=fft(coefficients);
    const root=rootOfUnity(Math.log2(n));
    for(let i=0;i<n;i++) {
      const point=baseExponent(root,BigInt(i));
      const direct=Array(5).fill(0n);
      coefficients.forEach((coefficient,j)=>coefficient.forEach((limb,k)=>{
        direct[k]=normalize(direct[k]+limb*baseExponent(point,BigInt(j)));
      }));
      assert.deepEqual(evaluations[i],direct);
      assert.deepEqual(evalPolynomial(coefficients,fromBase(point)),direct);
    }
    assert.deepEqual(fft(evaluations,true),coefficients);
    assert.deepEqual(coefficients,original);
  }
  assert.deepEqual(evalPolynomial([],ONE),ZERO);
  const point=[2n,1n,3n,0n,4n],coefficients=[ONE,point,[4n,3n,2n,1n,0n]];
  let power=[...ONE],direct=Array(5).fill(0n);
  for(const coefficient of coefficients){
    const term=referenceProduct(coefficient,power);
    direct=direct.map((value,i)=>normalize(value+term[i]));
    power=referenceProduct(power,point);
  }
  assert.deepEqual(evalPolynomial(coefficients,point),direct);
  for(const bad of [[],[ONE,ONE,ONE],Array(65537).fill(ONE)])assert.throws(()=>fft(bad));
  assert.throws(()=>fft(Array(1)));
  assert.throws(()=>fft([ONE],'true'));
  assert.throws(()=>fft([[P,0n,0n,0n,0n]]));
});
