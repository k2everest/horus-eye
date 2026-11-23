import test from 'node:test';
import assert from 'node:assert/strict';
import {searchConditionalParameters} from './parameter-search.mjs';
import {screenStandaloneFri} from '../fri-qrom-bound.mjs';
const ratio=f=>({n:BigInt(f.numerator),d:BigInt(f.denominator)});
const equal=(a,b)=>{a=ratio(a);b=ratio(b);return a.n*b.d===b.n*a.d;};
const le=(a,b)=>{a=ratio(a);b=ratio(b);return a.n*b.d<=b.n*a.d;};
const one=options=>searchConditionalParameters({extensionDegrees:[5],domainLogs:[16],queryCounts:[720],idealHashBits:[512],...options});

test('the default bounded grid enumerates every abstract combination without granting qualification',()=>{
  const r=searchConditionalParameters();
  assert.equal(r.total_combinations,180);assert.equal(r.results.length,180);
  assert.equal(new Set(r.results.map(x=>[x.extension_degree,x.domain_log2,x.queries,x.ideal_hash_bits].join(':'))).size,180);
  assert.equal(r.counts.conditional_pass+r.counts.conditional_fail,180);
  assert.ok(r.counts.conditional_pass>0);assert.ok(r.counts.conditional_fail>0);
  assert.equal(r.criterion.global_quantum_oracle_query_budget,(1n<<128n).toString());
  assert.equal(r.budget.scenario.instances,(1n<<38n).toString());
  assert.equal(r.criterion.target_failure_bits,1);assert.equal(r.proofs_generated,0);
  assert.equal(r.novel_cryptographic_algorithms_tested,0);assert.equal(r.demonstrated_post_quantum_bits,null);
  for(const v of [r,...r.results])for(const k of ['applicable_to_accepted_engine','aegis_target_met','production_ready'])assert.equal(v[k],false);
  assert.ok(r.results.filter(x=>x.extension_degree!==5).every(x=>!x.extension_arithmetic_implemented_in_reference));
  assert.equal(Object.isFrozen(r.results),true);assert.equal(Object.isFrozen(r.results[0]),true);
});

test('degree-five single-instance error exactly matches the independently exposed standalone screen',()=>{
  const scope={oracleQueries:1n<<128n,receipts:1n,segmentsPerReceipt:1n,
    expansionQueriesPerInstance:123n,expandedPairsPerInstance:456n};
  const found=one(scope).results[0],reference=screenStandaloneFri({domainLog2:16,queries:720,hashBits:512,
    adversaryQueries:scope.oracleQueries,verificationHashCalls:123n,expandedPairs:456n,instances:1});
  assert.ok(equal(found.round_by_round_error.algebraic,reference.round_by_round_error.algebraic));
  assert.ok(equal(found.round_by_round_error.sampling,reference.round_by_round_error.sampling));
  assert.ok(equal(found.conditional_failure_upper_bound,reference.conditional_failure_upper_bound));
  assert.equal(found.conditional_inequality_holds,reference.conditional_inequality_holds);
});

test('more field range, more queries or more ideal output never worsens the conditional bound',()=>{
  const r=searchConditionalParameters({extensionDegrees:[5,6,8],domainLogs:[16],queryCounts:[640,720,1024],idealHashBits:[384,512,768]});
  const find=(d,q,h)=>r.results.find(x=>x.extension_degree===d&&x.queries===q&&x.ideal_hash_bits===h).conditional_failure_upper_bound;
  for(const q of [640,720,1024])for(const h of [384,512,768]){
    assert.ok(le(find(6,q,h),find(5,q,h)));assert.ok(le(find(8,q,h),find(6,q,h)));
  }
  for(const d of [5,6,8])for(const h of [384,512,768]){
    assert.ok(le(find(d,720,h),find(d,640,h)));assert.ok(le(find(d,1024,h),find(d,720,h)));
  }
  for(const d of [5,6,8])for(const q of [640,720,1024]){
    assert.ok(le(find(d,q,512),find(d,q,384)));assert.ok(le(find(d,q,768),find(d,q,512)));
  }
});

test('raising only queries cannot bypass an algebraic floor and a 256-bit ideal hash fails this global budget',()=>{
  const r=one({queryCounts:[720,1024,2048]}),rows=r.results;
  assert.ok(rows.every(x=>!x.conditional_inequality_holds&&x.failure_reasons.includes('algebraic-floor')));
  assert.ok(equal(rows[1].conditional_failure_upper_bound,rows[2].conditional_failure_upper_bound));
  const strongField=one({extensionDegrees:[8],queryCounts:[2048],idealHashBits:[256]}).results[0];
  assert.equal(strongField.conditional_inequality_holds,false);assert.ok(strongField.failure_reasons.includes('hash-collisions'));
});

test('the residual target is explicit and even a future abstract pass remains unqualified',()=>{
  const defaultGrid=searchConditionalParameters(),strictGrid=searchConditionalParameters({targetFailureBits:128});
  assert.equal(strictGrid.criterion.target_failure_bits,128);
  assert.ok(strictGrid.counts.conditional_pass<=defaultGrid.counts.conditional_pass);
  const candidate=one({extensionDegrees:[8],domainLogs:[12],queryCounts:[1280],idealHashBits:[768],targetFailureBits:128});
  assert.equal(candidate.results[0].conditional_inequality_holds,true);
  assert.equal(candidate.results[0].extension_arithmetic_implemented_in_reference,false);
  assert.equal(candidate.results[0].theorem_hypotheses_discharged,false);
  assert.equal(candidate.results[0].knowledge_demonstrated,false);assert.equal(candidate.results[0].privacy_demonstrated,false);
  assert.equal(candidate.aegis_target_met,false);assert.equal(candidate.production_ready,false);
});

test('duplicates, unknown options and resource cap violations fail before enumeration',()=>{
  for(const options of [null,[],{approved:true},{extensionDegrees:[]},{extensionDegrees:[5,5]},
    {domainLogs:[0]},{queryCounts:[4097]},{idealHashBits:[0]},{extensionDegrees:[33]},
    {oracleQueries:0n},{receipts:1},{segmentsPerReceipt:65n},{targetFailureBits:0},{maxCombinations:4097},
    {maxCombinations:179},{domainLogs:Array(65).fill(16)},
    {extensionDegrees:Array.from({length:16},(_,i)=>i+2),domainLogs:Array.from({length:16},(_,i)=>i+2),
      queryCounts:Array.from({length:17},(_,i)=>i+1),idealHashBits:[512]}])assert.throws(()=>searchConditionalParameters(options));
  const r=one({extensionDegrees:[8,5],queryCounts:[1024,720]});
  assert.deepEqual(r.grid.extension_degrees,[5,8]);assert.deepEqual(r.grid.query_counts,[720,1024]);
  assert.equal(r.total_combinations,4);
});
