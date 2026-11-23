import test from 'node:test';
import assert from 'node:assert/strict';
import {pq128EngineeringTarget} from './pq128-engineering-target.mjs';
test('target 336 interactive RBR bits and explicitly separate QROM hash term',()=>{
 const x=pq128EngineeringTarget();
 assert.equal(x.target_rbr_bits,336);
 assert.equal(x.algebraic_Q2_and_event_loss_bits,296);
 assert.equal(x.hash_Q3_and_event_loss_bits,424);
 assert.equal(x.conditional_algebraic_residual_bits_after_reserve,8);
 assert.equal(x.conditional_hash_residual_bits_after_reserve,56);
 assert.equal(x.conditional_logup_field_degree,16);
 assert.equal(x.necessary_logup_margin_positive,true);
 assert.equal(x.actual_FRI_soundness_bits,null);
 assert.equal(x.pq128_demonstrated,false);
 assert.equal(x.production_ready,false);
});
test('BabyBear^8 and BabyBear^11 fail proposed 336-bit engineer budget',()=>{
 for(const deg of [8,11]){
   assert.equal(pq128EngineeringTarget({fieldDegree:deg}).necessary_logup_margin_positive,false);
 }
 assert.equal(pq128EngineeringTarget({fieldDegree:12}).necessary_logup_margin_positive,true);
 assert.throws(()=>pq128EngineeringTarget({rbrTargetBits:0}));
 assert.throws(()=>pq128EngineeringTarget({fieldDegree:40}));
});
