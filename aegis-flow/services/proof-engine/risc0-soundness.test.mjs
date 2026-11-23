import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {upstreamProvenDiagnostics} from './risc0-soundness.mjs';

const profile = JSON.parse(readFileSync(new URL('./security-profile.json', import.meta.url), 'utf8'));
const parameters = {...profile.parameters, trace_polynomials: 315, biggest_combo: 6};

test('upstream list-decoding routine agrees with an independent Python reproduction of pinned rv32im taps', () => {
  // Independent translation of the pinned Rust routine over taps [103,1,211]
  // and combo sizes [1,2,6,6,5]. These are not measured quantum security bits.
  for (const [tracePo2, expected, rounds] of [[18, 45.3013995294, 3], [24, 33.5865394972, 4]]) {
    const report = upstreamProvenDiagnostics(parameters, {tracePo2, segments: 64});
    assert.ok(Math.abs(report.segment_error_negative_log2 - expected) < 1e-9);
    assert.ok(Math.abs(report.illustrative_union_error_negative_log2 - (expected - 6)) < 1e-9);
    assert.equal(report.analysis.folding_rounds, rounds);
    assert.equal(report.analysis.m_plus, 6);
    assert.equal(report.demonstrated_post_quantum_bits, null);
    assert.equal(report.target_met, false);
  }
});

test('more queries leave proximity and algebraic error terms in place', () => {
  const current = upstreamProvenDiagnostics(parameters, {tracePo2: 24});
  const increased = upstreamProvenDiagnostics({...parameters, fri_queries: 128}, {tracePo2: 24});
  assert.ok(increased.error_terms.fri_queries < current.error_terms.fri_queries);
  for (const name of ['lookup', 'fri_proximity', 'fri_folding', 'deep', 'ali']) {
    assert.equal(increased.error_terms[name], current.error_terms[name]);
  }
  // Removing the query error cannot exceed the remaining dominant term.
  // binary64 may round the much smaller remaining terms away.
  assert.ok(increased.segment_error_negative_log2 <= increased.term_negative_log2.fri_proximity);
  assert.equal(increased.target_met, false);
});

test('unsupported scopes and malformed dimensions fail instead of producing a qualification', () => {
  for (const tracePo2 of [0, 12, 25, NaN, Infinity, 18.5]) {
    assert.throws(() => upstreamProvenDiagnostics(parameters, {tracePo2}));
  }
  for (const segments of [0, 65, NaN, Infinity, 1.5]) {
    assert.throws(() => upstreamProvenDiagnostics(parameters, {tracePo2: 18, segments}));
  }
  for (const changes of [{extension_degree: 0}, {extension_degree: 9}, {trace_polynomials: 1},
    {biggest_combo: 2 ** 18}, {fri_fold: 1}, {inverse_rate: 8}, {field_prime: NaN}]) {
    assert.throws(() => upstreamProvenDiagnostics({...parameters, ...changes}, {tracePo2: 18}));
  }
});
