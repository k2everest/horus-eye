// This gateway only validates demo envelopes. No configuration can make it
// production-ready until cryptographic verification and persistent state exist.
export function assertDemoRuntime(env = process.env) {
  const mode = env.AEGIS_MODE ?? 'demo';
  if (env.NODE_ENV === 'production' || mode !== 'demo') {
    throw new Error('AEGIS_PRODUCTION_BLOCKED: demo verifier; real crypto, proofs and persistent state are required');
  }
}
