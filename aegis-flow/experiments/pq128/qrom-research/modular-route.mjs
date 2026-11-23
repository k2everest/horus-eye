// Aegis V5: research-only quantum security feasibility screen.
import {readFileSync} from 'node:fs';
// Chiesa-Di-Hu-Zheng, ePrint 2025/2166 (EUROCRYPT 2026).
// O((t+k)^2 * epsilon_RBR + t^3 / 2^sigma) is NOT a concrete
// theorem instantiation for Plonky3, and not a proof of PQ128.
const BABY_BEAR = 2013265921n;
const LOGUP_NUMERATOR = 1n << 27n;
const REQUIRED_TERMS = ['air-composition','deep-ali','low-degree-test',
  'logup-fingerprint','batch-combination'];

const assertInteger = (name, x, low, high) => {
  if (!Number.isSafeInteger(x) || x < low || x > high)
    throw new RangeError('INVALID_' + name);
};
const assertBig = (name, x, low, high) => {
  if (typeof x !== 'bigint' || x < low || x > high)
    throw new RangeError('INVALID_' + name);
};
const rational = (n, d) => ({ numerator: n.toString(), denominator: d.toString() });
const meets = (n, d, residualBits) => (n << BigInt(residualBits)) <= d;

// Diagnostic only; floating-point RBR reports are not proof artifacts.
function extractReportedRbr(report) {
  if (report == null) return null;
  if (report.schema !== 'AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1' ||
      report.rbr_report_is_for_actual_compiled_wired_air !== true ||
      report.qrom_fiat_shamir_reduction_proved !== false)
    throw new TypeError('UNTRUSTED_WIRED_RBR_REPORT');
  const regimes = [report.rbr_breakdown?.udr, report.rbr_breakdown?.ldr]
    .filter(Boolean).map(regime => {
      const terms = regime.terms;
      if (!Array.isArray(terms)) throw new TypeError('MISSING_RBR_TERMS');
      const found = new Map();
      for (const term of terms) {
        if (!term || typeof term.label !== 'string' ||
            !Number.isFinite(term.bits) || term.bits < 0 || found.has(term.label))
          throw new TypeError('INVALID_RBR_TERM');
        found.set(term.label, term.bits);
      }
      for (const name of REQUIRED_TERMS)
        if (!found.has(name)) throw new TypeError('MISSING_RBR_' + name);
      const bits = REQUIRED_TERMS.map(name => found.get(name));
      const min = Math.min(...bits);
      return { regime: regime.regime,
        algebraic_union_bound_bits: min - Math.log2(bits.reduce((s, b) => s + 2 ** (min - b), 0)),
        commitment_collision_bits: found.get('commitment-collision') ?? null };
    });
  if (!regimes.length) throw new TypeError('EMPTY_RBR_REGIMES');
  return {
    program_sha512: report.program_sha512 ?? null,
    trace_rows: report.trace_rows ?? null,
    regimes,
    // If both are valid upper bounds, use the worse (smallest bit strength).
    // Applicability of either decoding regime still requires separate proof.
    conservative_algebraic_bits: Math.min(...regimes.map(x => x.algebraic_union_bound_bits)),
    selection_policy: 'worst_reported_regime; applicability_not_verified',
  };
}

/**
 * Illustrative exact-rational unit-prefactor budget; never certifies PQ128.
 * When rounds=null, k=0 is an explicitly optimistic screen.
 * The event union is NOT a demonstrated protocol composition theorem.
 */
export function assessModularQromRoute({
  quantumQueries = 1n << 128n,
  receipts = 1n << 32n,
  segments = 64,
  eventFamilies = 4,
  rounds = null,
  extensionDegree = 8,
  merkleDigestBits = 512,
  wiredRbrReport = null,
} = {}) {
  assertBig('QUANTUM_QUERIES', quantumQueries, 1n, 1n << 256n);
  assertBig('RECEIPTS', receipts, 1n, 1n << 64n);
  assertInteger('SEGMENTS', segments, 1, 4096);
  assertInteger('EVENT_FAMILIES', eventFamilies, 1, 4096);
  if (rounds !== null) assertInteger('ROUNDS', rounds, 0, 1_000_000);
  assertInteger('EXTENSION_DEGREE', extensionDegree, 1, 32);
  assertInteger('MERKLE_DIGEST_BITS', merkleDigestBits, 1, 2048);

  const events = receipts * BigInt(segments) * BigInt(eventFamilies);
  const k = BigInt(rounds ?? 0);
  const field = BABY_BEAR ** BigInt(extensionDegree);
  const digestSpace = 1n << BigInt(merkleDigestBits);
  const rbrNum = events * (quantumQueries + k) ** 2n * LOGUP_NUMERATOR;
  const merkleNum = events * quantumQueries ** 3n;
  const totalNum = rbrNum * digestSpace + merkleNum * field;
  const totalDen = field * digestSpace;
  const reported = extractReportedRbr(wiredRbrReport);
  const obligations = Object.freeze({
    formal_full_WiredAir_RBR_knowledge_soundness: false,
    IOP_to_IOR_or_SNRDX_reduction_mapping: false,
    transcript_is_exact_BCS_construction: false,
    round_count_and_query_cost_proved: false,
    salted_Merkle_MMCS_quantum_extractability: false,
    complete_FRI_ALI_DEEP_LogUp_RBR_bound: false,
    BCS_theorem_nonasymptotic_constants_instantiated: false,
    quantum_global_composition_proved: false,
    financial_witness_extractor_proved: false,
    quantum_zero_knowledge_and_unlinkability_proved: false,
  });
  return Object.freeze({
    schema: 'AEGIS_V5_MODULAR_BCS_QROM_RESEARCH_V1',
    reference: 'Chiesa-Di-Hu-Zheng, ePrint 2025/2166, EUROCRYPT 2026',
    use_case: 'necessary_optimistic_feasibility_screen_only',
    modeled_qrom_structure: 'O((Q+k)^2 * eps_RBR + Q^3/2^sigma)',
    k_assumed_zero_for_optimistic_screen: rounds === null,
    constants_assumed_one_for_screen: true,
    event_union_unproved: true,
    quantum_queries: quantumQueries.toString(),
    events: events.toString(),
    extension_degree: extensionDegree,
    merkle_digest_bits: merkleDigestBits,
    logup_only: {
      fraction: rational(rbrNum, field),
      g1_unit_prefactor: meets(rbrNum, field, 1),
      g2_unit_prefactor: meets(rbrNum, field, 128),
    },
    merkle_only: {
      fraction: rational(merkleNum, digestSpace),
      g1_unit_prefactor: meets(merkleNum, digestSpace, 1),
      g2_unit_prefactor: meets(merkleNum, digestSpace, 128),
    },
    sum_of_these_two_subterms_only: {
      fraction: rational(totalNum, totalDen),
      g1_unit_prefactor: meets(totalNum, totalDen, 1),
      g2_unit_prefactor: meets(totalNum, totalDen, 128),
    },
    actual_wired_rbr_observation: reported,
    // No combination of JSON inputs can promote research to a certificate.
    obligations,
    theorem_hypotheses_verified: false,
    theorem_constants_verified: false,
    complete_financial_relation_proved: false,
    pq128_demonstrated: false,
    production_ready: false,
  });
}
if (process.argv[1]?.endsWith('modular-route.mjs')) {
  const argValue = name => {
    const i = process.argv.indexOf(name);
    if (i === -1) return null;
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--'))
      throw new Error('MISSING_' + name);
    return process.argv[i + 1];
  };
  const rawReport = argValue('--wired-rbr');
  const degree = argValue('--degree');
  const digestBits = argValue('--digest-bits');
  const roundArg = argValue('--rounds');
  const result = assessModularQromRoute({
    wiredRbrReport: rawReport ? JSON.parse(readFileSync(rawReport, 'utf8')) : null,
    extensionDegree: degree === null ? 8 : Number(degree),
    merkleDigestBits: digestBits === null ? 512 : Number(digestBits),
    rounds: roundArg === null ? null : Number(roundArg),
  });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (process.argv.includes('--authorize-production')) process.exitCode = 1;
}