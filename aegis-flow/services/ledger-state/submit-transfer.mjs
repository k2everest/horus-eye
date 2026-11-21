import { verifyTransferSignature, statementForTransfer } from '../../libs/crypto-core/transfer-v2.mjs';
import { verifyTxProofV1 } from '../../libs/crypto-core/verifier-v1.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
import { LedgerConflict } from './store.mjs';

export async function submitProvenTransfer({ ledger, transaction, proof, backend = defaultStarkBackend() }) {
  if (!ledger) return { valid: false, status_code: 'STATE_NOT_CONFIGURED', settled: false };
  try { transaction = structuredClone(transaction); proof = structuredClone(proof); }
  catch { return { valid: false, status_code: 'INVALID_SIGNATURE_OR_SCHEMA', settled: false }; }
  if (!verifyTransferSignature(transaction)) return { valid: false, status_code: 'INVALID_SIGNATURE_OR_SCHEMA', settled: false };
  if (transaction.network_id !== ledger.networkId) return { valid: false, status_code: 'NETWORK_MISMATCH', settled: false };
  const statement = statementForTransfer(transaction);
  const verified = await verifyTxProofV1({ statement, proof, backend });
  if (!verified.valid) return { valid: false, status_code: verified.status_code === 'UNAVAILABLE' ? 'ZK_BACKEND_NOT_CONFIGURED' : 'STARK_PROOF_INVALID', settled: false };
  try {
    const applied = ledger.commitTransition({
      transactionId: transaction.tx_id, requestId: transaction.request_id,
      expectedRoot: transaction.anchor_state_root, inputCommitments: transaction.input_commitments,
      newCommitments: transaction.output_commitments, nullifiers: transaction.nullifiers,
      verification: { scheme: proof.scheme, program_id: verified.program_id, proof_digest: verified.proof_digest },
      publicTransaction: transaction, proof,
    });
    const receipt = { ...ledger.receipt(transaction.request_id), replayed: applied.replayed };
    return { valid: true, status_code: receipt.settled ? 'FINALIZED_PERMISSIONED' : 'APPLIED_LOCAL', receipt,
      validation_scope: 'signature-stark-and-persistent-state', settled: receipt.settled, production_ready: false };
  } catch (error) {
    if (error instanceof LedgerConflict) return { valid: false, status_code: error.code, settled: false };
    throw error;
  }
}
