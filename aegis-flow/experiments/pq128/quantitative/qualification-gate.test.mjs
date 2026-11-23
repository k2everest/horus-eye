import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPq128Evidence} from './qualification-gate.mjs';
import {analyzeQuantitatively} from './analysis.mjs';

test('current Aegis whole-receipt PQ128 evidence fails closed',()=>{
  const r=auditPq128Evidence(analyzeQuantitatively());
  assert.equal(r.status,'HOLD_NO_GO');
  assert.equal(r.production_ready,false);
  assert.equal(r.aegis_target_met,false);
  for(const id of ['legacy-value-binding','soundness','knowledge','privacy','qrom-composition','quantitative-target'])
    assert.ok(r.findings.some(f=>f.id===id),id);
});
test('passing hypothetical SHA-512 bound does not qualify the full protocol',()=>{
  const report=analyzeQuantitatively();
  assert.equal(report.conditional_cms_requirements.hypothetical_hash512.conditional_inequality_holds,true);
  report.aegis_target_met=true;
  report.production_ready=true;
  report.demonstrated_post_quantum_bits=128;
  report.aggregation.demonstrated_soundness_bound={numerator:'0',denominator:'1'};
  for(const game of report.separate_security_games)game.applicable_upper_bound={numerator:'0',denominator:'1'};
  const audit=auditPq128Evidence(report);
  assert.equal(audit.status,'HOLD_NO_GO');
  assert.equal(audit.production_ready,false);
  assert.ok(audit.findings.some(f=>f.id==='legacy-value-binding'));
});
test('missing, duplicate or substituted security games are rejected',()=>{
  assert.throws(()=>auditPq128Evidence({}),TypeError);
  const report=analyzeQuantitatively();
  report.separate_security_games=[report.separate_security_games[0],report.separate_security_games[0],report.separate_security_games[2]];
  assert.throws(()=>auditPq128Evidence(report),TypeError);
});

function claimedReport(){
  const report=analyzeQuantitatively();
  report.source_profile_verified=true;
  report.conditional_value_binding.legacy_256.fits_query_budget=false;
  report.demonstrated_post_quantum_bits=128;
  for(const game of report.separate_security_games){
    game.applicable_upper_bound={numerator:'0',denominator:'1'};
    report.aggregation[`demonstrated_${game.id}_bound`]={numerator:'0',denominator:'1'};
  }
  report.theorem_applicability=report.theorem_applicability.map(item=>({...item,status:'proved-for-accepted-engine'}));
  return report;
}
const finding=(report,id)=>auditPq128Evidence(report).findings.some(item=>item.id===id);

test('malformed probabilities cannot erase game findings from the evidence inventory',()=>{
  const malformed=[false,0,NaN,'0',{},[],
    {numerator:'0',denominator:'0'},{numerator:'-1',denominator:'2'},
    {numerator:'2',denominator:'1'},{numerator:'2',denominator:'4'},
    {numerator:'00',denominator:'1'},{numerator:0,denominator:1},
    {numerator:'0',denominator:'1',hypothetical:true},
    {numerator:'0',denominator:'1'.repeat(1501)}];
  for(const id of ['soundness','knowledge','privacy'])for(const value of malformed){
    const report=claimedReport();
    report.aggregation[`demonstrated_${id}_bound`]=value;
    assert.equal(finding(report,id),true);
    const other=claimedReport();
    other.separate_security_games.find(game=>game.id===id).applicable_upper_bound=value;
    assert.equal(finding(other,id),true);
  }
});

test('empty, duplicate, substituted or malformed theorem inventories remain incomplete',()=>{
  const base=claimedReport().theorem_applicability;
  for(const items of [[],undefined,{},base.slice(1),[...base,base[0]],
    base.map((x,i)=>i===0?{...base[1]}:x),
    base.map((x,i)=>i===0?{...x,component:'unreviewed-backend'}:x),
    base.map((x,i)=>i===0?{...x,reason:''}:x),
    base.map((x,i)=>i===0?{...x,extra:true}:x),
    base.map((x,i)=>i===0?null:x)]){
    const report=claimedReport();report.theorem_applicability=items;
    assert.equal(finding(report,'qrom-composition'),true);
  }
});

test('only a safe numeric strength of at least 128 is well-formed target evidence',()=>{
  for(const bits of [null,false,NaN,Infinity,-1,0,127,127.9,'128',Number.MAX_SAFE_INTEGER+1]){
    const report=claimedReport();report.demonstrated_post_quantum_bits=bits;
    assert.equal(finding(report,'quantitative-target'),true);
  }
  const report=claimedReport();report.source_profile_verified='true';
  assert.equal(finding(report,'source-identity'),true);
});

test('the previously empty fabricated inventory now exposes all malformed claims',()=>{
  const report=claimedReport();
  for(const game of report.separate_security_games){
    game.applicable_upper_bound=false;report.aggregation[`demonstrated_${game.id}_bound`]=false;
  }
  report.theorem_applicability=[];report.demonstrated_post_quantum_bits=-1;
  for(const id of ['soundness','knowledge','privacy','qrom-composition','quantitative-target'])assert.equal(finding(report,id),true);
});

test('well-formed claimed bounds and theorem labels still cannot qualify a protocol',()=>{
  const report=claimedReport();
  for(const bound of [{numerator:'0',denominator:'1'},{numerator:'1',denominator:'2'},{numerator:'1',denominator:'1'}]){
    report.aggregation.demonstrated_soundness_bound=bound;
    report.separate_security_games.find(game=>game.id==='soundness').applicable_upper_bound=bound;
    const audit=auditPq128Evidence(report);
    assert.equal(finding(report,'soundness'),false,'well-formedness only; not a threshold or theorem verifier');
    assert.equal(audit.status,'HOLD_NO_GO');assert.equal(audit.aegis_target_met,false);assert.equal(audit.production_ready,false);
  }
});
