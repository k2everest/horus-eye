import test from 'node:test';
import assert from 'node:assert/strict';
import {idealClawBound} from './claw-bound.mjs';

test('an independent exact Grover amplitude recurrence checks the small good-event window',()=>{
  const N=1n<<16n;
  for(let marked=128n;marked<=384n;marked++){
    let a=1n,b=1n,d=1n;
    for(let step=0;step<8;step++){
      [a,b]=[(N-2n*marked)*a+2n*(N-marked)*b,-2n*marked*a+(N-2n*marked)*b];
      d*=N;
    }
    // These scaled amplitudes give success M*a^2/(N*d^2).
    assert.ok(5n*marked*a*a>=N*d*d);
  }
});
const rational=r=>[BigInt(r.numerator),BigInt(r.denominator)];

test('finite n32/c10 case agrees with independent integer arithmetic and a fixed rational vector',()=>{
  const r=idealClawBound({outputBits:32,tableBits:10,queryBudget:9224n});
  assert.equal(r.oracle_queries,'9224');assert.equal(r.memory_entries,'1024');
  assert.equal(r.parameters.grover_iterations_per_restart,'1024');
  assert.deepEqual(r.probability_bounds.joint_good_event_lower_bound,{numerator:'2138834175',denominator:'2147483648'});
  assert.deepEqual(r.success_probability_lower_bound,{numerator:'31569192423',denominator:'53687091200'});
  const [n,d]=rational(r.success_probability_lower_bound),N=2n**32n,k=2n**10n;
  // Independent cross-multiplication of (369/625)*(1-k(k-1)/(2N))*(1-4/k).
  assert.equal(n*625n*2n*N*k,d*369n*(2n*N-k*(k-1n))*(k-4n));
  assert.equal(r.fits_query_budget,true);
  assert.equal(idealClawBound({outputBits:32,tableBits:10,queryBudget:9223n}).fits_query_budget,false);
  assert.equal(r.scope,'random-oracle-query-model');
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
});

test('256- and 512-bit ideal-function examples have explicit table/query budgets, never real-hash security claims',()=>{
  const small=idealClawBound({outputBits:256,tableBits:86});
  assert.equal(BigInt(small.oracle_queries),3n*(1n<<86n)+8n);
  assert.equal(BigInt(small.memory_entries),1n<<86n);assert.equal(small.fits_query_budget,true);
  const large=idealClawBound({outputBits:512,tableBits:172});
  assert.equal(BigInt(large.oracle_queries),(1n<<173n)+8n);
  assert.equal(BigInt(large.memory_entries),1n<<172n);assert.equal(large.fits_query_budget,false);
  const alternative=idealClawBound({outputBits:512,tableBits:170});
  assert.equal(BigInt(alternative.oracle_queries),9n*(1n<<170n)+8n);
  for(const r of [small,large,alternative]){
    const [n,d]=rational(r.success_probability_lower_bound);
    assert.ok(100n*n>59n*d);assert.ok(n<=d);
    assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
    assert.ok(r.assumptions.some(a=>a.includes('not bounded here')));
  }
});

test('probability bounds stay in [0,1], including an uninformative collision bound',()=>{
  for(const options of [{outputBits:16,tableBits:8},{outputBits:32,tableBits:24},{outputBits:4096,tableBits:4088}]){
    const r=idealClawBound(options);
    for(const p of [...Object.values(r.probability_bounds),r.success_probability_lower_bound]){
      const [n,d]=rational(p);assert.ok(n>=0n&&d>0n&&n<=d);
    }
  }
  assert.deepEqual(idealClawBound({outputBits:32,tableBits:24}).success_probability_lower_bound,{numerator:'0',denominator:'1'});
});

test('malformed, nonintegral, oversized and unsupported bit/query counts fail before arithmetic',()=>{
  for(const opts of [
    {outputBits:0},{outputBits:15},{outputBits:4097},{outputBits:NaN},{outputBits:256.5},{outputBits:'256'},
    {tableBits:7},{tableBits:4097},{tableBits:Infinity},{tableBits:86.5},{tableBits:'86'},
    {outputBits:256,tableBits:250},{outputBits:256,tableBits:87},{outputBits:256,tableBits:258},
    {queryBudget:0n},{queryBudget:-1n},{queryBudget:1},{queryBudget:NaN},{queryBudget:1n<<4097n},
  ])assert.throws(()=>idealClawBound(opts),TypeError);
});
