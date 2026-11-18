// Real signatures, STARK proofs and local durable state do not replace protocol
// review, parameter review, key lifecycle, consensus and production operations.
export function assertDemoRuntime(env = process.env) {
  const mode = env.AEGIS_MODE ?? 'demo';
  if (env.NODE_ENV === 'production' || mode !== 'demo') {
    throw new Error('AEGIS_PRODUCTION_BLOCKED: protocol/security review, key lifecycle and production operations are required');
  }
}
