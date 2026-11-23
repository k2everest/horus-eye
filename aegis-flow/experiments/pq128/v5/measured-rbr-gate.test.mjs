import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMeasuredWiredRbr} from './measured-rbr-gate.mjs';
const report=()=>{
 const terms=[
  {label:'air-composition',bits:230},
  {label:'deep-ali',bits:223},
  {label:'low-degree-test',bits:210},
  {label:'logup-fingerprint',bits:220},
  {label:'batch-combination',bits:216},
  {label:'commitment-collision',bits:170},
 ];
 return {schema:'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1',
  rbr_report_is_for_actual_compiled_wired_air:true,qrom_fiat_shamir_reduction_proved:false,
  trace_rows:4096,num_lookups:1,num_quotient_chunks:2,fri_queries:320,
  program_sha512:'ab'.repeat(64),rbr_breakdown:{udr:{regime:'UniqueDecoding',terms},ldr:null}};
};
test('separate the capped 170-bit commitment term from real algebraic ALI/DEEP/FRI/LogUp/batching',()=>{
 const r=assessMeasuredWiredRbr(report());
 assert.ok(r.measured_interactive_algebraic_union_bits>200);
 assert.ok(r.measured_interactive_algebraic_union_bits<210);
 assert.equal(r.reports.udr.collision_assumption_bits,170);
 assert.equal(r.reaches_selected_rbr_target,false);
 assert.equal(r.margin_over_CMS_Q2_necessary_bits<0,true);
 assert.equal(r.pq128_demonstrated,false);
 assert.equal(r.production_ready,false);
});
test('fail closed on missing LogUp term and fraudulently self-certified reports',()=>{
 const bad=report();bad.rbr_breakdown.udr.terms=bad.rbr_breakdown.udr.terms.filter(t=>t.label!=='logup-fingerprint');
 assert.throws(()=>assessMeasuredWiredRbr(bad));
 assert.throws(()=>assessMeasuredWiredRbr({...report(),qrom_fiat_shamir_reduction_proved:true}));
 assert.throws(()=>assessMeasuredWiredRbr(report(),{queryBits:-1}));
});
test('full WiredAir accounting cannot silently omit batching or any other required event',()=>{
 const original=report();
 for(const omitted of original.rbr_breakdown.udr.terms.map(t=>t.label)){
  const bad=report();
  bad.rbr_breakdown.udr.terms=bad.rbr_breakdown.udr.terms.filter(t=>t.label!==omitted);
  assert.throws(()=>assessMeasuredWiredRbr(bad),/RBR/);
 }
 const substituted=report();
 substituted.rbr_breakdown.udr.terms.find(t=>t.label==='batch-combination').label='unrecognized-event';
 assert.throws(()=>assessMeasuredWiredRbr(substituted),/INVALID_RBR_TERM/);
 const extra=report();extra.rbr_breakdown.udr.terms.push({label:'unrecognized-event',bits:0});
 assert.throws(()=>assessMeasuredWiredRbr(extra),/RBR/);
 const duplicate=report();
 duplicate.rbr_breakdown.udr.terms.find(t=>t.label==='batch-combination').label='deep-ali';
 assert.throws(()=>assessMeasuredWiredRbr(duplicate),/INVALID_RBR_TERM/);
 const valid=assessMeasuredWiredRbr(original);
 assert.equal(valid.reports.udr.algebraic_terms['batch-combination'],216);
 assert.equal(valid.pq128_demonstrated,false);
 assert.equal(valid.production_ready,false);
});
