import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixedWiredLogUpBound,exhaustiveBaseFieldLogUp,
} from './logup-fixed-oracle-lemma.mjs';

test('actual WiredAir 8M gate bound improves generic beta pair enumeration without certifying RBR',()=>{
  const x=fixedWiredLogUpBound({
    gateCount:8_000_000,wireCount:8_388_608,extensionDegree:8,
  });
  assert.equal(x.T,'32388608');
  assert.equal(x.beta_exceptional_at_most,String(2*8_388_608-1));
  assert.equal(x.alpha_exceptional_at_most,String(2*32_388_608-1));
  assert.ok(x.improvement_bits>20);
  assert.ok(x.bound_bits>210&&x.bound_bits<230);
  assert.equal(x.full_logup_interactive_rbr_knowledge_proved,false);
  assert.equal(x.qrom_compilation_proved,false);
});
test('extension degree changes denominators only, not the bad-challenge numerator',()=>{
  const a=fixedWiredLogUpBound({gateCount:10,wireCount:12,extensionDegree:8});
  const b=fixedWiredLogUpBound({gateCount:10,wireCount:12,extensionDegree:16});
  assert.equal(a.probability_upper_bound.numerator,b.probability_upper_bound.numerator);
  assert.ok(b.bound_bits>a.bound_bits+240);
  assert.equal(b.pq128_demonstrated,false);
});
test('refuse zero gates, invalid wire limits and extension degree',()=>{
  for(const settings of [
    {gateCount:0,wireCount:2},{gateCount:1,wireCount:1},
    {gateCount:1,wireCount:2,extensionDegree:0},
    {gateCount:8_000_001,wireCount:3},
  ])assert.throws(()=>fixedWiredLogUpBound(settings));
});
test('small prime exhaustive: equal read/table multiset has zero fingerprint failure',()=>{
  const result=exhaustiveBaseFieldLogUp({
    prime:17,wireCount:3,
    reads:[{id:1,bit:1},{id:2,bit:0}],
    table:[{id:1,bit:1,count:1},{id:2,bit:0,count:1}],
  });
  assert.equal(result.matching_multisets,true);
  assert.equal(result.conditional_event_bound_valid,true);
});
test('small prime exhaustive: mismatched bits have only pole/zero/collision exceptional events',()=>{
  const result=exhaustiveBaseFieldLogUp({
    prime:17,wireCount:3,
    reads:[{id:1,bit:0},{id:2,bit:0}],
    table:[{id:1,bit:1,count:1},{id:2,bit:1,count:1}],
  });
  assert.equal(result.matching_multisets,false);
  assert.equal(result.conditional_event_bound_valid,true);
  assert.ok(result.bad_alpha_pairs>0);
  assert.ok(result.bad_beta_count>=0);
  assert.equal(result.proof_of_full_plonky3_rbr_knowledge,false);
});
test('adversarial multiplicities and duplicate keys remain within algebraic bound',()=>{
  const r=exhaustiveBaseFieldLogUp({
    prime:17,wireCount:4,
    reads:[{id:1,bit:0},{id:1,bit:0},{id:2,bit:1}],
    table:[{id:1,bit:1,count:2},{id:2,bit:0,count:1}],
  });
  assert.equal(r.conditional_event_bound_valid,true);
  assert.equal(r.matching_multisets,false);
});
test('refuse nonprime fields and noncanonical key/counts',()=>{
  assert.throws(()=>exhaustiveBaseFieldLogUp({
    prime:15,wireCount:3,reads:[],table:[],
  }),/NONPRIME/);
  assert.throws(()=>exhaustiveBaseFieldLogUp({
    prime:17,wireCount:3,reads:[{id:3,bit:1}],table:[],
  }),/INVALID_WIRE_KEY/);
  assert.throws(()=>exhaustiveBaseFieldLogUp({
    prime:17,wireCount:3,reads:[{id:1,bit:0}],table:[],
  }),/UNBALANCED/);
  assert.throws(()=>exhaustiveBaseFieldLogUp({
    prime:17,wireCount:3,reads:[],table:[{id:1,bit:0,count:17}],
  }),/INVALID_MULTIPLICITY/);
});
