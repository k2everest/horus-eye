import crypto from 'node:crypto';

import { buildStatementDigest, validateTxStatementShape } from './zk-statement.mjs';

function decodeProof(proof) {
  if (!proof || typeof proof !== 'string') {
    return { ok: false, error: 'proof ausente' };
  }

  try {
    const decoded = Buffer.from(proof, 'base64').toString('utf8');
    const payload = JSON.parse(decoded);
    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'proof inválida: base64/json malformado' };
  }
}

export function verifyTxProofV1({ statement, proof, verifyingKeyId = 'vk-aegis-v1', seenProofDigests }) {
  const startedAt = Date.now();
  const failedChecks = [];

  const shape = validateTxStatementShape(statement);
  if (!shape.valid) {
    return {
      valid: false,
      failed_checks: shape.errors.map((x) => `INVALID_ARGUMENT: ${x}`),
      verify_time_ms: Date.now() - startedAt,
      verifying_key_id: verifyingKeyId,
    };
  }

  const decoded = decodeProof(proof);
  if (!decoded.ok) {
    return {
      valid: false,
      failed_checks: [`INVALID_ARGUMENT: ${decoded.error}`],
      verify_time_ms: Date.now() - startedAt,
      verifying_key_id: verifyingKeyId,
    };
  }

  const statementDigest = buildStatementDigest(statement);
  const proofDigest = crypto.createHash('sha256').update(proof).digest('hex');
  const payload = decoded.payload;

  if (seenProofDigests?.has(proofDigest)) {
    failedChecks.push('FAILED_PRECONDITION: proof replay detectado');
  }

  if (payload.scheme !== 'LATTICE-ZK-MVP') {
    failedChecks.push('FAILED_PRECONDITION: proof scheme inválido');
  }
  if (payload.statement_digest !== statementDigest) {
    failedChecks.push('FAILED_PRECONDITION: statement_digest divergente');
  }
  if (!payload.ownership) failedChecks.push('FAILED_PRECONDITION: cláusula ownership ausente');
  if (!payload.balance) failedChecks.push('FAILED_PRECONDITION: cláusula balance ausente');
  if (!payload.range) failedChecks.push('FAILED_PRECONDITION: cláusula range ausente');
  if (!payload.nullifier_uniqueness) failedChecks.push('FAILED_PRECONDITION: cláusula nullifier_uniqueness ausente');
  if (!payload.witness_commitment) failedChecks.push('FAILED_PRECONDITION: witness_commitment ausente');

  const valid = failedChecks.length === 0;
  if (valid) seenProofDigests?.add(proofDigest);

  return {
    valid,
    failed_checks: failedChecks,
    statement_digest: statementDigest,
    proof_digest: proofDigest,
    verify_time_ms: Date.now() - startedAt,
    verifying_key_id: verifyingKeyId,
    proof_size_bytes: Buffer.byteLength(proof, 'utf8'),
  };
}
