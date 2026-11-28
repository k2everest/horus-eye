import test from 'node:test';
import assert from 'node:assert/strict';
import {publicSixSha512Capacity} from './financial-capacity-preflight.mjs';
import {ONE_SHA512_MEASURED,assessSixSha512Memory} from './financial-memory-gate.mjs';

test('complete six-SHA512 public circuit is screened against measured SHA512 RSS, not guessed free memory',()=>{
  const geometry=publicSixSha512Capacity();
  assert.equal(ONE_SHA512_MEASURED.peak_rss_kib,20803644);
  assert.equal(ONE_SHA512_MEASURED.rows,524288);
  const check=mem=>assessSixSha512Memory({
    geometry,availableMemoryKiB:mem*1048576,
  });
  const small=check(64);
  const high=check(256);
  assert.equal(small.sha512_hash_calls,6);
  assert.ok(small.financial_gate_count>1_000_000);
  assert.ok(small.trace_row_ratio>=4);
  assert.ok(small.screening_threshold_gib>64);
  assert.equal(small.sufficient_host_memory_screen,false);
  assert.equal(high.sufficient_host_memory_screen,true);
  assert.equal(small.projected_linear_kib,
    Math.ceil(20803644*geometry.trace_rows/524288));
  assert.ok(small.screening_threshold_kib>small.projected_linear_kib);
  assert.equal(small.projection_is_rigorous_upper_bound,false);
  for(const result of [small,high]){
    assert.equal(result.prove_or_verify_executed,false);
    assert.equal(result.financial_relation_proved,false);
    assert.equal(result.pq128_demonstrated,false);
    assert.equal(result.production_ready,false);
  }
});

test('missing and substituted public programs cannot pass memory preflight',()=>{
  for(const geometry of [undefined,
    {sha512_hash_calls:1,trace_rows:2097152,gate_count:2000000},
    {sha512_hash_calls:6,trace_rows:2097152,gate_count:1}]){
    assert.throws(()=>assessSixSha512Memory({geometry}));
  }
  assert.throws(()=>assessSixSha512Memory({
    geometry:{sha512_hash_calls:6,trace_rows:2097152,gate_count:2000000},
    availableMemoryKiB:Infinity,
  }));
});

test('cgroup remaining-memory limit overrides optimistic host MemAvailable',()=>{
  const g={sha512_hash_calls:6,trace_rows:2097152,gate_count:2000000};
  const result=assessSixSha512Memory({geometry:g,
    availableMemoryKiB:256*1048576,effectiveLimitKiB:32*1048576});
  assert.equal(result.available_memory_kib,32*1048576);
  assert.equal(result.sufficient_host_memory_screen,false);
});
