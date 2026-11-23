import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyPcsBatchToy} from './pcs-batch-terminal-toy.mjs';
test('one fixed corrupted position has at most k-1 exceptional batch alphas',()=>{
 const discrepancies=[[1,1],[0,0],[0,0]];
 const bad=[];
 for(let alpha=0;alpha<17;alpha++){
  const r=classifyPcsBatchToy({prime:17,discrepancies,
    alpha,queries:[0]});
  if(r.canonical_bad_alpha)bad.push(alpha);
  assert.equal(r.invalid_acceptance_is_exceptional,true);
 }
 assert.deepEqual(bad,[16]);
});
test('adversarial opening omitted by sampled query is an explicit bad event',()=>{
 const r=classifyPcsBatchToy({prime:17,discrepancies:[[1,1],[0,0]],
   alpha:0,queries:[1]});
 assert.equal(r.accepted,true);
 assert.equal(r.canonical_bad_alpha,false);
 assert.equal(r.query_missed_nonzero_batch,true);
 const detected=classifyPcsBatchToy({prime:17,
   discrepancies:[[1,1],[0,0]],alpha:0,queries:[0]});
 assert.equal(detected.accepted,false);
});
test('all fixed two-polynomial discrepancies over F17 classify every query',()=>{
 let tested=0;
 for(let a=0;a<17;a++)for(let b=0;b<17;b++)
  for(let alpha=0;alpha<17;alpha++)for(let q=0;q<2;q++){
   const r=classifyPcsBatchToy({prime:17,
     discrepancies:[[a,b],[0,0]],alpha,queries:[q]});
   assert.equal(r.invalid_acceptance_is_exceptional,true);
   assert.equal(r.pq128_demonstrated,false);
   tested++;
  }
 assert.equal(tested,9826);
});
test('post-alpha adaptive discrepancy can cancel for EVERY alpha: forbidden chronology',()=>{
 // For each alpha, a malicious prover AFTER seeing alpha sets e0=-alpha,e1=1.
 for(let alpha=0;alpha<17;alpha++){
  const r=classifyPcsBatchToy({prime:17,
    discrepancies:[[(17-alpha)%17,1]],alpha,queries:[0]});
  assert.equal(r.accepted,true);
  assert.equal(r.canonical_bad_alpha,true);
 }
 // This does NOT contradict the fixed-claim theorem: claims change each run.
});
test('rejects malformed inputs',()=>{
 assert.throws(()=>classifyPcsBatchToy({prime:15,
   discrepancies:[[1]],alpha:0,queries:[0]}));
 assert.throws(()=>classifyPcsBatchToy({prime:17,
   discrepancies:[[1],[1,2]],alpha:0,queries:[0]}));
});
