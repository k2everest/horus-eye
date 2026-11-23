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


test('two decoding regimes are conservatively evaluated at the weaker bound',()=>{
 const r=report();
 const weaker=structuredClone(r.rbr_breakdown.udr);
 weaker.regime='ListDecoding';
 weaker.terms=weaker.terms.map(term=>({...term,
   bits:term.label==='commitment-collision'?170:95}));
 r.rbr_breakdown.ldr=weaker;
 const assessment=assessMeasuredWiredRbr(r,{rbrTargetBits:150,queryBits:0,
   eventUnionBits:0,unknownConstantReserveBits:0});
 assert.equal(assessment.decoding_regime_policy,
   'CONSERVATIVE_WORST_CASE_UNTIL_VERIFIER_SELECTION_PROVED');
 assert.ok(assessment.reports.udr.algebraic_union_bound_bits>200);
 assert.ok(assessment.reports.ldr.algebraic_union_bound_bits<95);
 assert.equal(assessment.measured_interactive_algebraic_union_bits,
   assessment.reports.ldr.algebraic_union_bound_bits);
 assert.equal(assessment.reaches_selected_rbr_target,false);
 assert.equal(assessment.production_ready,false);
});
test('regime order cannot inflate RBR and malformed LDR fails closed',()=>{
 const r=report();
 const stronger=structuredClone(r.rbr_breakdown.udr);
 stronger.regime='ListDecoding';
 stronger.terms=stronger.terms.map(term=>({...term,
   bits:term.label==='commitment-collision'?170:400}));
 r.rbr_breakdown.ldr=stronger;
 let assessment=assessMeasuredWiredRbr(r);
 assert.equal(assessment.measured_interactive_algebraic_union_bits,
   assessment.reports.udr.algebraic_union_bound_bits);
 r.rbr_breakdown.ldr.terms=r.rbr_breakdown.ldr.terms.filter(
   term=>term.label!=='batch-combination');
 assert.throws(()=>assessMeasuredWiredRbr(r),/RBR/);
});
