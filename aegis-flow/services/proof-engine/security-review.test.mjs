import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewStarkSecurity, securityProfile, toyModelDiagnostics, circuitToyDiagnostics } from './security-review.mjs';

test('pinned inventory matches and current profile does not demonstrate target', () => {
  const report = reviewStarkSecurity();
  assert.equal(report.inventory_matches, true);
  assert.equal(report.target.post_quantum_bits, 128);
  assert.equal(report.target_met, false);
  assert.equal(report.demonstrated_post_quantum_bits, null);
  assert.equal(report.upstream_sources_checked, false);
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
    assert.equal(report.mismatches.length, Object.keys(securityProfile.upstream_source_sha256).length);
    assert.equal(report.target_met, false);
  } finally { rmSync(root, { recursive: true }); }
});

test('release check fails while diagnostic command succeeds', () => {
  const script = new URL('../../scripts/review-stark-security.mjs', import.meta.url);
  const diagnostic = JSON.parse(execFileSync(process.execPath, [script.pathname], { encoding: 'utf8' }));
  assert.equal(diagnostic.target_met, false);
  const release = spawnSync(process.execPath, [script.pathname, '--require-production'], { encoding: 'utf8' });
  assert.equal(release.status, 1);
  assert.equal(JSON.parse(release.stdout).production_ready, false);
});
