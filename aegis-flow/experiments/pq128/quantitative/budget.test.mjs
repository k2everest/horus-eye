import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveConditionalCmsBudget,evaluateConditionalCmsBound} from './budget.mjs';
const fraction=v=>[BigInt(v.numerator),BigInt(v.denominator)];

test('the explicit lifetime scenario has one global budget and exact component allocations',()=>{
  const r=deriveConditionalCmsBudget();
  assert.equal(r.scenario.instances,(1n<<38n).toString());
  assert.equal(r.scenario.oracle_queries_global,(1n<<128n).toString());
  assert.equal(r.scenario.global_expansion_query_allowance,((1n<<38n)*1_000_000n).toString());
  const [n,d]=fraction(r.required.maximum_round_by_round_error),t=BigInt(r.scenario.t),s=1n<<38n;
  assert.equal(n,1n);assert.equal(d,72n*s*t*t);
  assert.equal(BigInt(r.required.minimum_ideal_hash_range_for_collision_term),288n*s*t*t*t);
  assert.equal(r.required.sufficient_power_of_two_rbr_error_bits,301);
  assert.equal(r.required.minimum_binary_hash_bits_for_this_allocation,431);
  assert.equal(r.applicable_to_accepted_engine,false);assert.equal(r.aegis_target_met,false);
});

test('small finite case accounts for all terms and rounds hash sizes upward',()=>{
  const budget=deriveConditionalCmsBudget({oracleQueries:1n,receipts:1n,segmentsPerReceipt:1n,expansionQueriesPerInstance:0n,expandedPairsPerInstance:0n});
  assert.deepEqual(budget.required.maximum_round_by_round_error,{numerator:'1',denominator:'72'});
  assert.equal(budget.required.minimum_binary_hash_bits_for_this_allocation,9);
  const error=budget.required.maximum_round_by_round_error;
  const r=evaluateConditionalCmsBound({budget,roundByRoundError:error,hashBits:9});
  const [n,d]=fraction(r.conditional_failure_upper_bound);
  // 12/72 + 48/512 = 1/6 + 3/32 = 25/96.
  assert.equal(n*96n,d*25n);assert.equal(r.conditional_inequality_holds,true);
  const [cn,cd]=fraction(r.global_terms.hash_collisions);assert.ok(6n*cn<=cd);
  const smaller=evaluateConditionalCmsBound({budget,roundByRoundError:error,hashBits:8});
  const [sn,sd]=fraction(smaller.global_terms.hash_collisions);assert.ok(6n*sn>sd);
  // An equal-budget allocation may fail while the sum still passes.
  assert.equal(smaller.conditional_inequality_holds,true);
  for(const report of [r,smaller])assert.equal(report.aegis_target_met,false);
});

test('unknown evidence is not silently assigned zero and derived labels confer no authority',()=>{
  const budget=deriveConditionalCmsBudget();
  for(const error of [null,undefined]){
    const r=evaluateConditionalCmsBound({budget,roundByRoundError:error});
    assert.equal(r.conditional_failure_upper_bound,null);assert.equal(r.conditional_inequality_holds,false);
  }
  const misleading=structuredClone(budget);misleading.required.maximum_round_by_round_error={numerator:'0',denominator:'1'};
  const r=evaluateConditionalCmsBound({budget:misleading,roundByRoundError:{numerator:'1',denominator:'1'},hashBits:512});
  assert.deepEqual(r.conditional_failure_upper_bound,{numerator:'1',denominator:'1'});
  assert.equal(r.conditional_inequality_holds,false);
});

test('larger scope consumes the component budget rather than treating Q as per receipt',()=>{
  const one=deriveConditionalCmsBudget({receipts:1n,expansionQueriesPerInstance:0n});
  const many=deriveConditionalCmsBudget({receipts:1n<<32n,expansionQueriesPerInstance:0n});
  assert.equal(BigInt(many.required.maximum_round_by_round_error.denominator),(1n<<32n)*BigInt(one.required.maximum_round_by_round_error.denominator));
  const error={numerator:'1',denominator:(1n<<301n).toString()};
  const r=evaluateConditionalCmsBound({budget:deriveConditionalCmsBudget(),roundByRoundError:error,hashBits:512});
  assert.equal(r.conditional_inequality_holds,true);assert.equal(r.applicable_to_accepted_engine,false);
  assert.equal(evaluateConditionalCmsBound({budget:deriveConditionalCmsBudget(),roundByRoundError:error,hashBits:256}).conditional_inequality_holds,false);
});

test('malformed counts, fractions and unsupported output sizes fail',()=>{
  for(const options of [{oracleQueries:0n},{receipts:0n},{segmentsPerReceipt:-1n},{oracleQueries:1},{expandedPairsPerInstance:1n<<4096n},{targetFailureBits:0}])assert.throws(()=>deriveConditionalCmsBudget(options));
  const budget=deriveConditionalCmsBudget();
  for(const error of [{numerator:'0',denominator:'0'},{numerator:'2',denominator:'1'},
    {numerator:'01',denominator:'2'},{numerator:'2',denominator:'4'},{numerator:'1',denominator:'2',approved:true}]){
    assert.throws(()=>evaluateConditionalCmsBound({budget,roundByRoundError:error}));
  }
  assert.throws(()=>evaluateConditionalCmsBound({budget,roundByRoundError:{numerator:'0',denominator:'1'},hashBits:0}));
  const large=deriveConditionalCmsBudget({targetFailureBits:4096});
  assert.equal(evaluateConditionalCmsBound({budget:large,roundByRoundError:large.required.maximum_round_by_round_error,hashBits:4096}).conditional_inequality_holds,false);
  const malformed=structuredClone(budget);malformed.scenario.target_total_failure={numerator:'1',denominator:'3'};
  assert.throws(()=>evaluateConditionalCmsBound({budget:malformed,roundByRoundError:{numerator:'0',denominator:'1'}}));
});
