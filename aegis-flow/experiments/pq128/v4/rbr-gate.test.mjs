import test from 'node:test';
import assert from 'node:assert/strict';
import {assessV4Rbr} from './rbr-gate.mjs';
const report=()=>({
  schema:'AEGIS_V4_PLONKY3_RBR_LAB_REPORT_V1',
  challenge_extension_degree:8,log_blowup:3,fri_queries:320,
  random_codewords:8,salt_elements:16,field_cardinality_floor_bits:247,
  ideal_sha512_collision_bits_assumed:170,max_opening_points_budget:8,
  rbr_unique_decoding_bits:166,rbr_list_decoding_bits:171,
  rbr_best_bits:171,air_constraints_derived:300,
  air_constraint_degree_derived:2,batch_openings_derived:230,
  quotient_chunks_derived:4,
  financial_air_complete:false,aegis_target_met:false,
  production_ready:false,quantum_fiat_shamir_qrom_proved:false,
});
test('lifetime strict residual threshold is 168 for four event families, not a certification',()=>{
  const r=assessV4Rbr(report());
  assert.equal(r.required_uniform_adaptive_segment_bits,168);
  assert.equal(r.classically_sized_rbr_term,true);
  assert.equal(r.pq128_demonstrated,false);
  assert.equal(r.production_ready,false);
  assert.equal(r.decision,'HOLD_M1_QUANTUM_SOUNDNESS_UNPROVED');
});
test('small RBR cannot be promoted, missing evidence is not assigned zero',()=>{
  const r=report();r.rbr_best_bits=120;r.rbr_list_decoding_bits=120;r.rbr_unique_decoding_bits=100;
  assert.equal(assessV4Rbr(r).classically_sized_rbr_term,false);
  assert.throws(()=>assessV4Rbr({...r,rbr_best_bits:null}));
  assert.throws(()=>assessV4Rbr({...r,financial_air_complete:true}));
});
test('unrecognized lower proof parameters and invented security inputs reject',()=>{
  for(const patch of [{fri_queries:100},{log_blowup:1},{challenge_extension_degree:4},
    {random_codewords:0},{salt_elements:0},{rbr_best_bits:500},
    {ideal_sha512_collision_bits_assumed:512},{production_ready:true},
    {quantum_fiat_shamir_qrom_proved:true}]){
    assert.throws(()=>assessV4Rbr({...report(),...patch}));
  }
  for(const opts of [{receipts:0n},{receipts:1},{maxSegments:65},{residualBits:257}])
    assert.throws(()=>assessV4Rbr(report(),opts));
});
