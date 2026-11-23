import { defaultStarkBackend } from '../../services/proof-engine/backend.mjs';
import { starkStatementDigest } from './stark-statement.mjs';

// Local proving only: private witnesses never belong in a gateway request.
export async function proveTxV1({ statement, witness, backend = defaultStarkBackend() } = {}) {
  if (!backend?.availableForProving()) return { ok: false, error: 'ZK_BACKEND_NOT_CONFIGURED', proof_status: 'BACKEND_NOT_CONFIGURED' };
  const start = Date.now();
  try {
    const proof = await backend.prove({ statement, witness });
    return { ok: true, proof, statement_digest: starkStatementDigest(statement),
      prove_time_ms: Date.now() - start, proof_size_bytes: Buffer.from(proof.receipt, 'base64').length,
      proving_key_id: backend.programId };
  } catch {
    return { ok: false, error: 'PROOF_GENERATION_FAILED', prove_time_ms: Date.now() - start };
  }
}
