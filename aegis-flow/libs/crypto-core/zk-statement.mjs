import { buildTranscriptHash } from './canonical-transcript.mjs';

export function buildTxStatement({
  anchorStateRoot,
  inputCommitments,
  outputCommitments,
  nullifiers,
  publicAmount,
  publicAssetId = 'AEGIS',
}) {
  if (!anchorStateRoot) throw new Error('anchorStateRoot is required');
  if (!Array.isArray(inputCommitments) || inputCommitments.length === 0) throw new Error('inputCommitments is required');
  if (!Array.isArray(outputCommitments) || outputCommitments.length === 0) throw new Error('outputCommitments is required');
  if (!Array.isArray(nullifiers) || nullifiers.length === 0) throw new Error('nullifiers is required');

  return {
    anchor_state_root: anchorStateRoot,
    input_commitments: [...inputCommitments],
    output_commitments: [...outputCommitments],
    nullifiers: [...nullifiers],
    public_amount: publicAmount ?? 0,
    public_asset_id: publicAssetId,
  };
}

export function validateTxStatementShape(statement) {
  const errors = [];
  if (!statement?.anchor_state_root) errors.push('anchor_state_root ausente');
  if (!Array.isArray(statement?.input_commitments) || statement.input_commitments.length === 0) errors.push('input_commitments ausente');
  if (!Array.isArray(statement?.output_commitments) || statement.output_commitments.length === 0) errors.push('output_commitments ausente');
  if (!Array.isArray(statement?.nullifiers) || statement.nullifiers.length === 0) errors.push('nullifiers ausente');
  return { valid: errors.length === 0, errors };
}

export function buildStatementDigest(statement) {
  const shape = validateTxStatementShape(statement);
  if (!shape.valid) throw new Error(`invalid statement: ${shape.errors.join(', ')}`);

  return buildTranscriptHash({
    domainTag: 'PROOF_TX_V1',
    payload: {
      anchor_state_root: statement.anchor_state_root,
      input_commitments: statement.input_commitments,
      output_commitments: statement.output_commitments,
      nullifiers: statement.nullifiers,
      public_amount: statement.public_amount,
      public_asset_id: statement.public_asset_id,
    },
  });
}

export function createZkStatementEnvelope({ statement, constraintsVersion = 'ZK-STMT-V1' }) {
  const digest = buildStatementDigest(statement);
  return {
    constraints_version: constraintsVersion,
    statement,
    statement_digest: digest,
    clauses: {
      ownership: true,
      balance: true,
      range: true,
      nullifier_uniqueness: true,
    },
  };
}
