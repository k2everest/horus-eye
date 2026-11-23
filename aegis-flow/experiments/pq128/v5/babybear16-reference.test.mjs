import test from 'node:test';
import assert from 'node:assert/strict';
import {BB16,irreducibilityCertificate,one,zero,add,sub,mul,pow,inverse,encode,decode,uniformSample} from './babybear16-reference.mjs';
test('irreducible binomial criterion certificate and reference-only status',()=>{
 const c=irreducibilityCertificate();
 assert.equal(c.criterion_proved,true);
 assert.equal(c.implemented_in_plonky3,false);
 assert.equal(c.pcs_compatible,false);
 assert.equal(c.pq128_demonstrated,false);
});
test('canonical serialization, arithmetic and inverse are field operations',()=>{
 const a=Array.from({length:16},(_,i)=>BigInt(i+1)),b=Array.from({length:16},(_,i)=>BigInt(i*i+3));
 assert.deepEqual(decode(encode(a)),a);
 assert.deepEqual(sub(add(a,b),b),a);
 assert.deepEqual(mul(mul(a,b),one()),mul(a,b));
 assert.deepEqual(mul(a,inverse(a)),one());
 assert.deepEqual(mul(a,zero()),zero());
 const x=[0n,1n,...Array(14).fill(0n)];
 assert.deepEqual(pow(x,16n),[31n,...Array(15).fill(0n)]);
 const bad=Buffer.alloc(64);bad.writeUInt32LE(Number(BB16.prime));
 assert.throws(()=>decode(bad));
 assert.throws(()=>decode(Buffer.alloc(63)));
 assert.throws(()=>inverse(zero()));
});
test('sampling uses rejection, no biased modulo',()=>{
 let n=0;const r=uniformSample(()=>{
   const b=Buffer.alloc(4);b.writeUInt32LE(n++<16?0xffffffff:99);return b;
 });assert.equal(r.length,16);assert.ok(r.every(x=>x===99n));
 assert.throws(()=>uniformSample(()=>Buffer.alloc(4,255)));
});
