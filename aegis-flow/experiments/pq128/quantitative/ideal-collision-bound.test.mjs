import test from 'node:test';
import assert from 'node:assert/strict';
import {idealCollisionBound} from './ideal-collision-bound.mjs';

test('the tiny oracle case matches an independent integer evaluation of lifting and output conversion',()=>{
  const r=idealCollisionBound({outputBits:16,adversaryQueries:1n,candidatePairs:3n});
  // t=3; 3*(2*6*3^3 + 2*2)/2^16 = 123/8192.
  assert.deepEqual(r.conditional_collision_probability_upper_bound,{numerator:'123',denominator:'8192'});
  assert.equal(r.conditional_bound_at_most_half,true);
});

test('the financial512 ideal binding bound is nontrivial while binary256 gives only a vacuous upper bound',()=>{
  const r=idealCollisionBound(),p=r.conditional_collision_probability_upper_bound;
  const n=BigInt(p.numerator),d=BigInt(p.denominator);
  assert.ok(n*(1n<<90n)<d);assert.ok(n*(1n<<91n)>d);
  assert.equal(r.conditional_bound_at_most_half,true);assert.equal(r.concrete_sha512_security_demonstrated,false);
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
  const smaller=idealCollisionBound({outputBits:256});
  assert.deepEqual(smaller.conditional_collision_probability_upper_bound,{numerator:'1',denominator:'1'});
  assert.equal(smaller.conditional_bound_at_most_half,false);
  assert.deepEqual(idealCollisionBound({candidatePairs:0n}).conditional_collision_probability_upper_bound,{numerator:'0',denominator:'1'});
});

test('malformed budgets and output widths cannot acquire a conditional bound',()=>{
  for(const options of [{outputBits:0},{outputBits:512.5},{outputBits:4097},{adversaryQueries:1},{adversaryQueries:-1n},{candidatePairs:1n<<4096n}]){
    assert.throws(()=>idealCollisionBound(options));
  }
});
