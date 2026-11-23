import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewStarkSecurity, securityProfile, toyModelDiagnostics, circuitToyDiagnostics, toyParameterBudget } from './security-review.mjs';

test('pinned inventory matches and current profile does not demonstrate target', () => {
  const report = reviewStarkSecurity();
  assert.equal(report.inventory_matches, true);
  assert.equal(report.target.post_quantum_bits, 128);
  assert.equal(report.target_met, false);
  assert.equal(report.demonstrated_post_quantum_bits, null);
  assert.equal(report.upstream_sources_checked, false);
  assert.equal(report.parameter_verification.source_checked, false);
  assert.equal(report.quantum_qualification.source_profile_verified, false);
  assert.equal(report.quantum_qualification.qualified, false);
  assert.equal(report.quantum_qualification.decision, 'not-qualified-for-pq128');
  assert.equal(report.upstream_proven_diagnostics.length, 2);
  assert.equal(report.diagnostics.fri_term_negative_log2, 100);
  assert.ok(report.diagnostics.constraint_term_negative_log2 < 124);
});

test('query-only increase cannot lift toy estimator ceiling to 128', () => {
  const result = toyModelDiagnostics({ ...securityProfile.parameters, fri_queries: 128 });
  assert.equal(result.fri_term_negative_log2, 256);
  assert.ok(result.estimator_ceiling_bits < 124);
  for (const bad of [NaN, Infinity, 0, -1, 2.5]) {
    assert.throws(() => toyModelDiagnostics({ ...securityProfile.parameters, fri_queries: bad }));
  }
});

test('circuit-specific lookup errors and segment composition are explicit without asserting quantum bits', () => {
  for (const tracePo2 of [18, 24]) {
    const one = circuitToyDiagnostics(securityProfile.parameters, {tracePo2});
    const combined = circuitToyDiagnostics(securityProfile.parameters, {tracePo2, segments:64});
    // Independent direct reproduction of upstream lookup + constraints + FRI.
    const field = 2013265921 ** 4;
    const error = (103 / 4) * 3 * 2 ** tracePo2 / field + 1 / field + 4 ** -50;
    assert.ok(Math.abs(one.toy_segment_error_negative_log2 + Math.log2(error)) < 1e-10);
    assert.ok(Math.abs(combined.toy_union_error_negative_log2 - (one.toy_segment_error_negative_log2 - 6)) < 1e-10);
    assert.equal(combined.target_met, false);assert.equal(combined.demonstrated_post_quantum_bits, null);
    assert.ok(circuitToyDiagnostics({...securityProfile.parameters,fri_queries:128},{tracePo2,segments:64}).toy_union_error_negative_log2 < 100);
  }
  for(const options of [{tracePo2:25},{tracePo2:18,segments:65},{tracePo2:18,segments:0},{tracePo2:NaN}])assert.throws(()=>circuitToyDiagnostics(securityProfile.parameters,options));
});

test('missing upstream sources fail inventory verification', () => {
  const root = mkdtempSync(join(tmpdir(), 'aegis-security-'));
  try {
    const report = reviewStarkSecurity({ sourceRoot: root });
    assert.equal(report.upstream_sources_checked, true);
    assert.equal(report.inventory_matches, false);
    for (const name of Object.keys(securityProfile.upstream_source_sha256)) assert.ok(report.mismatches.includes(name));
    assert.equal(report.parameter_verification.parameters_match, false);
    assert.equal(report.quantum_qualification.source_profile_verified, false);
    assert.equal(report.target_met, false);
  } finally { rmSync(root, { recursive: true }); }
});

test('the pinned profile and nested parameters cannot be relabeled in memory', () => {
  for (const value of [securityProfile, securityProfile.parameters, securityProfile.target, securityProfile.repository_sha256]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { securityProfile.parameters.fri_queries = 128; }, TypeError);
  assert.throws(() => { securityProfile.target.post_quantum_bits = 1; }, TypeError);
  assert.throws(() => { securityProfile.repository_sha256['verifier/src/main.rs'] = '0'.repeat(64); }, TypeError);
  const report = reviewStarkSecurity();
  assert.equal(report.parameters.fri_queries, 50);
  assert.equal(report.diagnostics.fri_term_negative_log2, 100);
  assert.equal(report.target_met, false);
});

test('hypothetical sizing covers all error terms and attempts without approving a profile', () => {
  for (const attempts of [0, 32, 64]) {
    const budget = toyParameterBudget(securityProfile.parameters, {log2ReceiptAttempts: attempts});
    const p = {...securityProfile.parameters, fri_queries: budget.minimum_queries_for_this_allocation,
      extension_degree: budget.minimum_extension_degree_for_this_allocation};
    const diagnose = parameters => circuitToyDiagnostics(parameters, {tracePo2:24,segments:64});
    const result = diagnose(p);
    assert.ok(result.toy_union_error_negative_log2 - attempts >= 128);
    for (const bits of Object.values(result.term_negative_log2)) assert.ok(bits >= budget.required_per_term_negative_log2);
    assert.ok(diagnose({...p,fri_queries:p.fri_queries-1}).term_negative_log2.fri_queries < budget.required_per_term_negative_log2);
    assert.ok(diagnose({...p,extension_degree:p.extension_degree-1}).term_negative_log2.lookup < budget.required_per_term_negative_log2);
    assert.equal(budget.target_met, false);
    assert.equal(budget.demonstrated_post_quantum_bits, null);
    assert.equal(budget.sdk_support_checked, false);
  }
  assert.equal(toyParameterBudget(securityProfile.parameters).minimum_queries_for_this_allocation,68);
  assert.equal(toyParameterBudget(securityProfile.parameters).minimum_extension_degree_for_this_allocation,6);
  assert.equal(toyParameterBudget(securityProfile.parameters,{log2ReceiptAttempts:32}).minimum_extension_degree_for_this_allocation,7);
  for (const value of [NaN, Infinity, -1, 0.5, 1025]) assert.throws(() => toyParameterBudget(securityProfile.parameters,{log2ReceiptAttempts:value}));
  for (const value of [0, NaN, Infinity, -1, 0.5, 1025]) assert.throws(() => toyParameterBudget(securityProfile.parameters,{targetErrorBits:value}));
});

test('release check fails while diagnostic command succeeds', () => {
  const script = new URL('../../scripts/review-stark-security.mjs', import.meta.url);
  const diagnostic = JSON.parse(execFileSync(process.execPath, [script.pathname], { encoding: 'utf8' }));
  assert.equal(diagnostic.target_met, false);
  const release = spawnSync(process.execPath, [script.pathname, '--require-production'], { encoding: 'utf8' });
  assert.equal(release.status, 1);
  assert.equal(JSON.parse(release.stdout).production_ready, false);
  const missingSources = spawnSync(process.execPath, [script.pathname, '--require-source-profile'], { encoding: 'utf8' });
  assert.equal(missingSources.status, 1);
  assert.equal(JSON.parse(missingSources.stdout).quantum_qualification.source_profile_verified, false);
});
