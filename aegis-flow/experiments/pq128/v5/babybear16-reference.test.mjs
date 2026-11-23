import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
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
test('field operations reject sparse arrays rather than encoding omitted limbs as zero',()=>{
 for(const bad of [Array(16),Object.assign(Array(16),{0:1n}),
   Object.setPrototypeOf(Array(16),Object.assign(Object.create(Array.prototype),{0:1n}))]){
  for(const operation of [()=>encode(bad),()=>add(bad,zero()),()=>sub(zero(),bad),
    ()=>mul(bad,one()),()=>pow(bad,0n),()=>inverse(bad)])assert.throws(operation,/noncanonical/);
 }
});
test('canonical coefficient snapshots are used without rereading caller getters',()=>{
 const a=zero();let reads=0;
 Object.defineProperty(a,0,{get(){reads++;return reads===1?1n:BB16.prime;}});
 assert.deepEqual(decode(encode(a)),one());assert.equal(reads,1);
});
test('negative, non-bigint and oversized exponents fail within a bounded subprocess',()=>{
 // The unpatched powBase(-1) loop never terminates. Isolate this regression
 // so a future reintroduction fails promptly instead of hanging the runner.
 const moduleURL=new URL('./babybear16-reference.mjs',import.meta.url).href;
 const source=`import assert from 'node:assert/strict';
 import {powBase,pow,one} from ${JSON.stringify(moduleURL)};
 for(const n of [-1n,1,NaN,Infinity,'1',1n<<512n]){
  assert.throws(()=>powBase(31n,n),/bounded nonnegative bigint exponent/);
  assert.throws(()=>pow(one(),n),/bounded nonnegative bigint exponent/);
 }
 assert.equal(powBase(31n,0n),1n);assert.deepEqual(pow(one(),0n),one());`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',source],{timeout:2000,encoding:'utf8'});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});
