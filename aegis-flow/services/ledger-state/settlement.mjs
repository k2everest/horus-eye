import { verifyTransferSignature, statementForTransfer } from '../../libs/crypto-core/transfer-v2.mjs';
import { verifyTxProofV1 } from '../../libs/crypto-core/verifier-v1.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
import { checkpointId, verifyFinalityCertificate } from './finality.mjs';
import { submitProvenTransfer } from './submit-transfer.mjs';

export async function notarizeNextTransfer({ ledger, privateKey, backend = defaultStarkBackend() }) {
  const checkpoint = ledger.nextFinalityCheckpoint();
  const stored = ledger.publicTransaction(checkpoint.transaction_id);
  if (!stored || !verifyTransferSignature(stored.transaction) || stored.transaction.network_id !== ledger.networkId) throw new Error('INVALID_FINALITY_TRANSACTION');
  const result = await verifyTxProofV1({ statement: statementForTransfer(stored.transaction), proof: stored.proof, backend });
  if (!result.valid || result.proof_digest !== checkpoint.proof_digest || result.program_id !== checkpoint.program_id) throw new Error('FINALITY_STARK_REVERIFICATION_FAILED');
  return ledger.notarize({ privateKey, expectedCheckpointId: checkpointId(checkpoint) });
}

// Recovery/catch-up only: use a separately trusted config and finality anchor.
// A bad bundle may leave a valid local inclusion pending, never falsely finalized.
export async function replayFinalizedTransfer({ ledger, transaction, proof, certificate, backend = defaultStarkBackend() }) {
  ({ transaction, proof, certificate } = structuredClone({ transaction, proof, certificate }));
  const config = ledger.settlementConfig();
  if (!config || !certificate || certificate.checkpoint?.config_id !== ledger.settlementStatus().config_id ||
    certificate.checkpoint?.transaction_id !== transaction?.tx_id ||
    !verifyFinalityCertificate({ config, certificate, expectedCheckpoint: certificate.checkpoint })) throw new Error('INVALID_RECOVERY_CERTIFICATE');
  const result = await submitProvenTransfer({ ledger, transaction, proof, backend });
  if (!result.valid) throw new Error(`RECOVERY_TRANSFER_REJECTED:${result.status_code}`);
  ledger.acceptFinality(certificate);
  return ledger.receipt(transaction.request_id);
}
