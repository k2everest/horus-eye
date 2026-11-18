import { defaultStarkBackend } from '../../services/proof-engine/backend.mjs';
import { starkStatementDigest } from './stark-statement.mjs';

export async function verifyTxProofV1({ statement, proof, backend = defaultStarkBackend(), seenProofDigests } = {}) {
  if (!backend?.availableForVerification()) return {
    valid: false, status_code: 'UNAVAILABLE', proof_status: 'BACKEND_NOT_CONFIGURED',
    failed_checks: ['ZK_BACKEND_NOT_CONFIGURED'], production_ready: false,
  };
  const start = Date.now();
  try {
    statement = structuredClone(statement); proof = structuredClone(proof);
    const result = await backend.verify({ statement, proof });
    const replayed = result.valid && seenProofDigests?.has(result.proof_digest);
    const valid = result.valid && !replayed;
    if (valid) seenProofDigests?.add(result.proof_digest);
    return { ...result, valid, failed_checks: valid ? [] : [replayed ? 'PROOF_REPLAY' : 'STARK_PROOF_INVALID'],
      status_code: valid ? 'OK' : 'FAILED_PRECONDITION', proof_status: valid ? 'VERIFIED' : 'REJECTED',
      statement_digest: starkStatementDigest(statement), verifying_key_id: backend.programId,
      verify_time_ms: Date.now() - start, production_ready: false };
  } catch {
    return { valid: false, status_code: 'FAILED_PRECONDITION', failed_checks: ['STARK_PROOF_INVALID'], proof_status: 'REJECTED', production_ready: false };
  }
}
