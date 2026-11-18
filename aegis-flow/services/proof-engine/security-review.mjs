import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const engine = fileURLToPath(new URL('./', import.meta.url));
export const securityProfile = JSON.parse(readFileSync(join(engine, 'security-profile.json'), 'utf8'));

// Diagnostics for the two terms in upstream toy_model_security, NOT a complete
// soundness calculation, attack complexity, or quantum security reduction.
export function toyModelDiagnostics({ fri_queries, inverse_rate, field_prime, extension_degree }) {
  for (const n of [fri_queries, inverse_rate, field_prime, extension_degree]) {
    if (!Number.isSafeInteger(n) || n <= 0) throw new TypeError('invalid STARK diagnostic parameter');
  }
  if (inverse_rate < 2 || field_prime < 2) throw new TypeError('invalid field or rate');
  const fri = fri_queries * Math.log2(inverse_rate);
  const field = extension_degree * Math.log2(field_prime);
  return {
    fri_term_negative_log2: fri,
    constraint_term_negative_log2: field,
    estimator_ceiling_bits: Math.min(fri, field),
    interpretation: 'Ceiling on this toy estimator only; not an attack or a quantum security bound. Lookup and composition terms omitted.',
  };
}

// Reproduction of the three terms in pinned upstream toy_model_security,
// using its hard-coded constraint degree and the actual rv32im tap widths.
// A conjectural classical error model, NOT demonstrated quantum security.
export function circuitToyDiagnostics(parameters, {tracePo2, segments = 1} = {}) {
  const simple = toyModelDiagnostics(parameters);
  const {accumulator_columns: columns, constraint_degree: degree, extension_degree: extension} = parameters;
  for (const value of [columns, degree, tracePo2, segments]) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('invalid circuit diagnostic parameter');
  if (degree < 3 || tracePo2 > 24 || segments > 64) throw new TypeError('unsupported diagnostic scope');
  const lookupBits = simple.constraint_term_negative_log2 - (Math.log2(columns / extension) + Math.log2(degree - 2) + tracePo2);
  const terms = {lookup: lookupBits, constraints: simple.constraint_term_negative_log2, fri_queries: simple.fri_term_negative_log2};
  const minimum = Math.min(...Object.values(terms));
  const segmentBits = minimum - Math.log2(Object.values(terms).reduce((sum, bits) => sum + 2 ** (minimum - bits), 0));
  return {trace_po2: tracePo2, segments, term_negative_log2: terms,
    toy_segment_error_negative_log2: Math.max(0, segmentBits),
    toy_union_error_negative_log2: Math.max(0, segmentBits - Math.log2(segments)),
    demonstrated_post_quantum_bits: null, target_met: false,
    interpretation: 'Classical conjectural toy-model errors only. Union illustration assumes applicable per-segment error bounds; excludes hashes, Fiat-Shamir/QROM, zero knowledge and receipt composition analysis.'};
}

export function reviewStarkSecurity({ sourceRoot } = {}) {
  const mismatches = [];
  const check = (root, files) => {
    for (const [name, expected] of Object.entries(files)) {
      try {
        const actual = createHash('sha256').update(readFileSync(join(root, name))).digest('hex');
        if (actual !== expected) mismatches.push(name);
      } catch { mismatches.push(name); }
    }
  };
  check(engine, securityProfile.repository_sha256);
  const program = JSON.parse(readFileSync(join(engine, 'program.json'), 'utf8'));
  if (program.program_id !== securityProfile.program_id || program.sdk !== securityProfile.parameters.sdk) mismatches.push('program.json');
  if (sourceRoot) {
    check(sourceRoot, securityProfile.upstream_source_sha256);
    try {
      const taps = readFileSync(join(sourceRoot, `risc0-circuit-rv32im-${securityProfile.parameters.circuit}/src/zirgen/taps.rs`), 'utf8');
      const offsets = [...taps.matchAll(/TapData\s*\{\s*offset:\s*(\d+),\s*back:\s*\d+,\s*group:\s*0,/g)].map(match => Number(match[1]));
      if (!offsets.length || Math.max(...offsets) + 1 !== securityProfile.parameters.accumulator_columns) mismatches.push('parameters.accumulator_columns');
      const calculator = readFileSync(join(sourceRoot, `risc0-zkp-${securityProfile.parameters.zkp}/src/prove/soundness.rs`), 'utf8');
      const degree = calculator.match(/let max_degree = (\d+)\.0;/);
      if (!degree || Number(degree[1]) !== securityProfile.parameters.constraint_degree) mismatches.push('parameters.constraint_degree');
    } catch {
      // Missing sources already appear in the pinned inventory mismatches.
    }
  }
  return {
    schema: 'AEGIS_STARK_SECURITY_REVIEW_V1',
    target: securityProfile.target,
    parameters: securityProfile.parameters,
    program_id: securityProfile.program_id,
    inventory_matches: mismatches.length === 0,
    mismatches,
    upstream_sources_checked: Boolean(sourceRoot),
    diagnostics: toyModelDiagnostics(securityProfile.parameters),
    circuit_diagnostics: [securityProfile.parameters.prover_segment_po2, securityProfile.parameters.sdk_max_segment_po2].map(tracePo2 =>
      circuitToyDiagnostics(securityProfile.parameters, {tracePo2, segments: securityProfile.parameters.max_segments})),
    // No editable label or larger query count constitutes an accepted analysis.
    demonstrated_post_quantum_bits: null,
    target_met: false,
    production_ready: false,
    blockers: [
      'Current toy estimator cannot substantiate 128 bits even before Fiat-Shamir and receipt composition.',
      'No accepted end-to-end quantum/QROM analysis with explicit adversary budgets.',
      'Poseidon2, SHA-256 bindings, lookup/constraint errors, zero knowledge and up to 64 segments require composition review.',
      'Independent cryptographic audit and parameter approval are outstanding.',
    ],
  };
}
