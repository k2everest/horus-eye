// Signature verification is real, but ZK proofs, commitments and state are
// incomplete. No runtime flag can turn this lab gateway into a production ledger.
export function assertDemoRuntime(env = process.env) {
  const mode = env.AEGIS_MODE ?? 'demo';
  if (env.NODE_ENV === 'production' || mode !== 'demo') {
    throw new Error('AEGIS_PRODUCTION_BLOCKED: proofs, reviewed commitments and persistent state are required');
  }
}
