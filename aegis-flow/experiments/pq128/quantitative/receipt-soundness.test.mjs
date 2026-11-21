import test from 'node:test';
import assert from 'node:assert/strict';
import {modelCompositeSoundness} from './receipt-soundness.mjs';
const ONE_PERCENT={numerator:'1',denominator:'100'};

test('whole receipt and lifetime counts cover all accepted 1..64 segments',()=>{
  const r=modelCompositeSoundness();
  assert.equal(r.counts.segments,(1n<<38n).toString());
  assert.equal(r.counts.adjacent_boundaries,((1n<<32n)*63n).toString());
  assert.equal(r.event_families.length,4);
  assert.equal(r.event_families[0].sufficient_binary_bits_per_event_equal_family_allocation,41);
  assert.equal(r.event_families[1].sufficient_binary_bits_per_event_equal_family_allocation,40);
  assert.equal(r.event_families[2].sufficient_binary_bits_per_event_equal_family_allocation,35);
  assert.equal(r.qrom_cms_thresholds.sufficient_power_of_two_rbr_error_bits,301);
  assert.equal(r.qrom_cms_thresholds.minimum_binary_hash_bits_for_this_allocation,431);
  assert.deepEqual(r.collision_diagnostics.cross_link_ideal_256,{numerator:'1',denominator:'1'});
  assert.equal(r.computed_union_bound_if_all_assumptions_hold,null);
  assert.equal(r.demonstrated_whole_receipt_soundness_bound,null);
  assert.equal(r.demonstrated_post_quantum_bits,null);
  assert.equal(r.aegis_target_met,false);assert.equal(r.production_ready,false);
});

test('exact finite family union counts and conditional comparison never become certification',()=>{
  const params={receipts:2n,maxSegments:3,oracleQueries:1n,
    perSegmentFailure:ONE_PERCENT,perLinkFailure:ONE_PERCENT,
    perJournalFailure:ONE_PERCENT,perProgramIdentityFailure:ONE_PERCENT};
  const r=modelCompositeSoundness(params);
  assert.deepEqual(r.counts,{segments:'6',adjacent_boundaries:'4',journal_events:'2',trusted_program_events:'2'});
  assert.deepEqual(r.computed_union_bound_if_all_assumptions_hold,{numerator:'7',denominator:'50'});
  assert.equal(r.hypothetical_target_inequality_holds,true);
  assert.equal(r.aegis_target_met,false);
  const strict=modelCompositeSoundness({...params,targetFailureBits:4});
  assert.equal(strict.hypothetical_target_inequality_holds,false);
  assert.deepEqual(strict.computed_union_bound_if_all_assumptions_hold,{numerator:'7',denominator:'50'});
  assert.equal(strict.demonstrated_whole_receipt_soundness_bound,null);
});

test('unproved family cannot silently receive probability zero',()=>{
  const r=modelCompositeSoundness({receipts:2n,maxSegments:2,
    perSegmentFailure:{numerator:'0',denominator:'1'},
    perLinkFailure:{numerator:'0',denominator:'1'},
    perJournalFailure:{numerator:'0',denominator:'1'}});
  assert.equal(r.computed_union_bound_if_all_assumptions_hold,null);
  assert.equal(r.hypothetical_target_inequality_holds,false);
  assert.equal(r.event_families[3].assumed_uniform_adaptive_per_event_error,null);
});

test('uniform global Q is not inadvertently multiplied per segment',()=>{
  const r=modelCompositeSoundness();
  assert.equal(r.research_assumptions.global_oracle_queries,(1n<<128n).toString());
  assert.equal(r.collision_diagnostics.cross_link_ideal_512.numerator!=='1'||
    r.collision_diagnostics.cross_link_ideal_512.denominator!=='1',true);
  assert.equal(r.research_assumptions.attempts_limit_enforced_by_network,false);
  assert.equal(r.research_assumptions.all_failure_modes_proved_exhaustive,false);
  const single=modelCompositeSoundness({receipts:1n,maxSegments:1,oracleQueries:2n});
  assert.equal(single.counts.adjacent_boundaries,'0');
});

test('malformed input and fake probabilities reject instead of inferring a theorem',()=>{
  for(const params of [{receipts:0n},{receipts:1},{maxSegments:65},{maxSegments:0},{oracleQueries:0n},
    {targetFailureBits:0},{targetFailureBits:4097},{perSegmentFailure:{numerator:'01',denominator:'100'}},
    {perSegmentFailure:{numerator:'1',denominator:'0'}},{perSegmentFailure:{numerator:'2',denominator:'1'}},
    {perLinkFailure:{numerator:'2',denominator:'4'}},{perJournalFailure:{numerator:'1',denominator:'2',certified:true}},
    {perProgramIdentityFailure:1}])assert.throws(()=>modelCompositeSoundness(params));
});
