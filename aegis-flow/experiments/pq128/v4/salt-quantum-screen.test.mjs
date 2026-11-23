import test from 'node:test';
import assert from 'node:assert/strict';
import {screenQuantumSaltSearch} from './salt-quantum-screen.mjs';
test('8 BabyBear salts do not clear generic Grover Q=2^128 baseline; 16 clear conditional horizon screen',()=>{
  const old=screenQuantumSaltSearch({salts:8});
  const current=screenQuantumSaltSearch({salts:16});
  assert.equal(old.conditional_success_below_half,false);
  assert.equal(current.conditional_success_below_half,true);
  assert.equal(current.conditional_residual_target_met,true);
  assert.equal(current.salt_elements,16);
  assert.equal(current.salt_uniform_space,(2013265921n**16n).toString());
  assert.equal(current.event_budget,((1n<<32n)*64n*4n).toString());
  assert.equal(current.salt_hiding_proved,false);
  assert.equal(current.aegis_target_met,false);
  assert.equal(current.production_ready,false);
});
test('strong residual and malformed inputs fail closed',()=>{
  assert.equal(screenQuantumSaltSearch({salts:8}).conditional_residual_target_met,false);
  for(const c of [{salts:0},{salts:129},{queries:2},{queries:0n},
    {segments:0},{receipts:0n},{eventFamilies:0},{residualBits:0}])
    assert.throws(()=>screenQuantumSaltSearch(c));
});
