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

// Parameter sizing in the SAME conjectural classical model as above. This is
// an engineering rejection screen, never a quantum reduction or release gate.
// Allocate equal error budgets to lookup, constraints and FRI, then union-bound
// segments and hypothetical receipt attempts. No grinding benefit is assumed.
export function toyParameterBudget(parameters, {targetErrorBits = 128, tracePo2 = 24, segments = 64, log2ReceiptAttempts = 0} = {}) {
  circuitToyDiagnostics(parameters, {tracePo2, segments});
  for (const n of [targetErrorBits, log2ReceiptAttempts]) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 1024) throw new TypeError('invalid error budget');
  }
  if (targetErrorBits < 1) throw new TypeError('invalid error budget');
  const fieldBits = Math.log2(parameters.field_prime);
  const termBits = targetErrorBits + Math.log2(segments) + log2ReceiptAttempts + Math.log2(3);
  const queries = Math.ceil(termBits / Math.log2(parameters.inverse_rate));
  // Lookup depends on extension degree too; do not freeze columns/d at d=4
  // when screening a hypothetical larger extension.
  let extension = 1;
  while (extension * fieldBits < termBits ||
    extension * fieldBits - Math.log2(parameters.accumulator_columns / extension) - Math.log2(parameters.constraint_degree - 2) - tracePo2 < termBits) extension++;
  const proposed = {...parameters, fri_queries: queries, extension_degree: extension};
  const diagnostic = circuitToyDiagnostics(proposed, {tracePo2, segments});
  return {
    target_error_negative_log2: targetErrorBits,
    trace_po2: tracePo2, segments, log2_receipt_attempts: log2ReceiptAttempts,
    allocation: 'equal budget across three toy-model error terms; union over segments and hypothetical receipt attempts',
    required_per_term_negative_log2: termBits,
    minimum_queries_for_this_allocation: queries,
    minimum_extension_degree_for_this_allocation: extension,
    hypothetical_toy_total_error_negative_log2: diagnostic.toy_union_error_negative_log2 - log2ReceiptAttempts,
    sdk_support_checked: false,
    demonstrated_post_quantum_bits: null, target_met: false,
    interpretation: 'Hypothetical classical toy-model sizing only, not a supported SDK profile, a proof of security, or a conversion of classical bits to quantum bits. Hashes, QROM, knowledge and zero knowledge still require separate analysis.',
  };
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
    hypothetical_parameter_budgets: [0, 32].map(log2ReceiptAttempts => toyParameterBudget(securityProfile.parameters, {
      targetErrorBits: securityProfile.target.post_quantum_bits,
      tracePo2: securityProfile.parameters.sdk_max_segment_po2,
      segments: securityProfile.parameters.max_segments, log2ReceiptAttempts,
    })),
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
