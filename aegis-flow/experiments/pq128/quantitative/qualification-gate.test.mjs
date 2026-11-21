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
