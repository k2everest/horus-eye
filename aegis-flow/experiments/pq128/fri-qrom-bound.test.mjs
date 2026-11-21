import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {screenStandaloneFri} from './fri-qrom-bound.mjs';
const ratio = v => [BigInt(v.numerator),BigInt(v.denominator)];

test('the explicit standalone candidate satisfies the conditional inequality, never the Aegis gate',()=>{
  const r=screenStandaloneFri();
  const [n,d]=ratio(r.conditional_failure_upper_bound);
  assert.ok(n*2n<d);
  assert.ok(n*256n<d); // probability < 2^-8 at the *assumed* 2^128 query budget
  assert.ok(n*1000n>3n*d && n*10000n<31n*d); // independent result: about 0.00306793675
  assert.equal(r.conditional_inequality_holds,true);
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
  const p=(1n<<64n)-(1n<<32n)+1n;
  const [a,b]=ratio(r.round_by_round_error.algebraic);
  assert.equal(a*48n*p**5n,b*823543n*(1n<<32n));
});

test('a passing conditional FRI screen never authorizes the CLI Aegis gate',()=>{
  const r=spawnSync(process.execPath,[new URL('./screen.mjs',import.meta.url).pathname,'--require-aegis'],{encoding:'utf8'});
  assert.equal(r.status,1);
  const report=JSON.parse(r.stdout);
  assert.equal(report.conditional_inequality_holds,true);
  assert.equal(report.aegis_target_met,false);
  assert.equal(spawnSync(process.execPath,[new URL('./screen.mjs',import.meta.url).pathname,'--accept'],{encoding:'utf8'}).status,1);
});

test('hash256, fewer queries, larger domain or stronger failure claim invalidate the candidate',()=>{
  for(const options of [{hashBits:256},{queries:50},{domainLog2:24},{targetFailureBits:128}]) {
    const r=screenStandaloneFri(options);assert.equal(r.conditional_inequality_holds,false);
    assert.equal(r.aegis_target_met,false);
  }
});

test('small case matches an independent integer evaluation and accounts for expansion and union',()=>{
  const r=screenStandaloneFri({queries:1,adversaryQueries:1n,verificationHashCalls:0n,expandedPairs:0n,instances:1,hashBits:64});
  const [a,b]=ratio(r.quantum_error_terms.rbr_reduction);
  assert.equal(a,9n*b); // 12 * 1^2 * (3/4)
  assert.deepEqual(r.conditional_failure_upper_bound,{numerator:'1',denominator:'1'});
  const one=screenStandaloneFri({instances:1});
  const many=screenStandaloneFri({instances:64});
  const [on,od]=ratio(one.conditional_failure_upper_bound),[mn,md]=ratio(many.conditional_failure_upper_bound);
  assert.equal(mn*od,64n*on*md);
  const more=screenStandaloneFri({verificationHashCalls:1n<<128n});
  const [en,ed]=ratio(more.conditional_failure_upper_bound);
  assert.ok(en*md>mn*ed);
  const expanded=screenStandaloneFri({expandedPairs:1n<<511n});
  assert.deepEqual(expanded.conditional_failure_upper_bound,{numerator:'1',denominator:'1'});
  const [cn,cd]=ratio(one.quantum_error_terms.hash_collisions);
  const t=(1n<<128n)+1_000_000n;
  assert.equal(cn*(1n<<512n),cd*48n*t**3n);
  const [xn,xd]=ratio(one.quantum_error_terms.expansion);
  assert.equal(xn*(1n<<512n),xd*2_000_000n);
});

test('reject malformed counts and out-of-domain parameters before large arithmetic',()=>{
  for(const options of [{domainLog2:33},{domainLog2:1},{queries:0},{queries:Infinity},{queries:16385},
    {hashBits:0},{instances:0},{targetFailureBits:0},{adversaryQueries:1},{adversaryQueries:-1n},
    {verificationHashCalls:1.1},{expandedPairs:1n<<4096n}]) assert.throws(()=>screenStandaloneFri(options),TypeError);
});
