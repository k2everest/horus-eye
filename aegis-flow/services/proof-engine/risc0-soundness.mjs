// Numerical reproduction of the `proven` routine in the Apache-2.0 licensed
// risc0-zkp 3.0.6/src/prove/soundness.rs. This is a diagnostic, not a new
// security theorem, a formal interval calculation, or a quantum reduction.
export function upstreamProvenDiagnostics(parameters, {tracePo2, segments = 1} = {}) {
  const {
    field_prime: prime, extension_degree: extension, inverse_rate: inverseRate,
    fri_queries: queries, fri_fold: fold, fri_min_degree: finalDegree,
    accumulator_columns: accumulator, constraint_degree: degree,
    trace_polynomials: tracePolynomials, biggest_combo: biggestCombo,
  } = parameters;
  for (const value of [prime, extension, inverseRate, queries, fold, finalDegree,
    accumulator, degree, tracePolynomials, biggestCombo, tracePo2, segments]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('invalid upstream diagnostic parameter');
  }
  if (prime < 2 || extension > 8 || inverseRate !== 4 || fold !== 16 || finalDegree !== 256 ||
    degree !== 5 || tracePolynomials < accumulator || tracePolynomials > 1_000_000 ||
    tracePo2 < 13 || tracePo2 > 24 || biggestCombo >= 2 ** tracePo2 || segments > 64 || queries > 1024) {
    throw new TypeError('unsupported upstream diagnostic scope');
  }

  // M is an analysis constant in the pinned routine, not a prover setting.
  const m = 16, rho = 1 / inverseRate, sqrtRho = Math.sqrt(rho);
  const field = prime ** extension, trace = 2 ** tracePo2, domain = trace * inverseRate;
  const segmentPolynomials = degree - 1;
  let foldingRounds = 0;
  for (let size = trace; size > finalDegree; size /= fold) foldingRounds++;
  const alpha = (1 + 1 / (2 * m)) * sqrtRho;
  const rhoPlus = (trace + biggestCombo) / domain;
  const sqrtRhoPlus = Math.sqrt(rhoPlus);
  const mPlus = Math.ceil(1 / (biggestCombo * (alpha / sqrtRhoPlus - 1)));
  const lPlus = (mPlus + 0.5) / sqrtRhoPlus;
  if (alpha <= sqrtRhoPlus || field <= trace + domain || !Number.isFinite(field)) {
    throw new TypeError('upstream diagnostic assumptions not met');
  }
  const proximityGap = (m + 0.5) ** 7 / (3 * sqrtRho ** 3) * domain ** 2 / field;
  const errors = {
    lookup: accumulator / extension * (degree - 2) * trace / field,
    fri_proximity: (tracePolynomials + segmentPolynomials - 0.5) * proximityGap,
    fri_folding: (2 * m + 1) * (domain + 1) * fold * foldingRounds / (sqrtRho * field),
    fri_queries: alpha ** queries,
    deep: lPlus * (segmentPolynomials * (trace + biggestCombo - 1) + trace - 1) / (field - trace - domain),
    ali: lPlus * tracePolynomials / field,
  };
  const error = Object.values(errors).reduce((a, b) => a + b, 0);
  if (!Object.values(errors).every(e => e > 0 && Number.isFinite(e)) || !Number.isFinite(error)) {
    throw new TypeError('unrepresentable upstream diagnostic');
  }
  return {
    model: 'risc0-zkp-3.0.6-proven-list-decoding-routine',
    arithmetic: 'approximate JavaScript binary64; upstream uses float32; no directed rounding',
    trace_po2: tracePo2, segments,
    dimensions: {accumulator_columns: accumulator, trace_polynomials: tracePolynomials, biggest_combo: biggestCombo},
    analysis: {m, rho, alpha, m_plus: mPlus, l_plus: lPlus, folding_rounds: foldingRounds},
    error_terms: errors,
    term_negative_log2: Object.fromEntries(Object.entries(errors).map(([name, e]) => [name, -Math.log2(e)])),
    error_sum: error,
    segment_error_negative_log2: Math.max(0, -Math.log2(error)),
    illustrative_union_error_negative_log2: Math.max(0, -Math.log2(error * segments)),
    demonstrated_post_quantum_bits: null, target_met: false,
    interpretation: 'Reproduces the pinned routine named proven, using its list-decoding analysis and constants. Not an end-to-end proof for the compiled instance, an attack cost, or a QROM/quantum/ZK bound. Segment union is illustrative and requires applicable per-segment bounds. Hash binding, Fiat-Shamir, knowledge, leakage and receipt/lifetime composition remain outside this calculation.',
  };
}
