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
  if (sourceRoot) check(sourceRoot, securityProfile.upstream_source_sha256);
  return {
    schema: 'AEGIS_STARK_SECURITY_REVIEW_V1',
    target: securityProfile.target,
    parameters: securityProfile.parameters,
    program_id: securityProfile.program_id,
    inventory_matches: mismatches.length === 0,
    mismatches,
    upstream_sources_checked: Boolean(sourceRoot),
    diagnostics: toyModelDiagnostics(securityProfile.parameters),
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
