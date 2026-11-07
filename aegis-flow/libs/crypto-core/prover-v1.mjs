import crypto from 'node:crypto';

import { buildStatementDigest, validateTxStatementShape } from './zk-statement.mjs';

function h(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function proveTxV1({ statement, witness, provingKeyId = 'pk-aegis-v1' }) {
  const startedAt = Date.now();

  const shape = validateTxStatementShape(statement);
  if (!shape.valid) {
    return {
      ok: false,
      error: `invalid statement: ${shape.errors.join(', ')}`,
      prove_time_ms: Date.now() - startedAt,
    };
  }

  if (!witness || !witness.spend_secret_ref) {
    return {
      ok: false,
      error: 'invalid witness: spend_secret_ref ausente',
      prove_time_ms: Date.now() - startedAt,
    };
  }

  const statementDigest = buildStatementDigest(statement);

  const proofPayload = {
    scheme: 'LATTICE-ZK-MVP',
    proving_key_id: provingKeyId,
    statement_digest: statementDigest,
    ownership: true,
    balance: true,
    range: true,
    nullifier_uniqueness: true,
    witness_commitment: h(`${witness.spend_secret_ref}|${(witness.note_paths || []).length}|${(witness.openings || []).length}`),
    created_at: new Date(startedAt).toISOString(),
  };

  const proof = Buffer.from(JSON.stringify(proofPayload)).toString('base64');

  return {
    ok: true,
    proof,
    statement_digest: statementDigest,
    prove_time_ms: Date.now() - startedAt,
    proof_size_bytes: Buffer.byteLength(proof, 'utf8'),
    proving_key_id: provingKeyId,
  };
}
