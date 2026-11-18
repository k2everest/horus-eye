import { buildTranscriptHash, canonicalSerialize } from '../../libs/crypto-core/canonical-transcript.mjs';
import { createPublicKey } from 'node:crypto';
import { exportPublicKey, signerTag, signDigest, verifyDigest } from '../../libs/crypto-core/pqc-wrapper.mjs';

const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === keys.sort().join(',');
const hash = (domainTag, payload) => buildTranscriptHash({ domainTag, payload });
export const FINALITY_ALGORITHM = 'ML-DSA-65';

export function assertSettlementConfig(config) {
  if (!exact(config, ['schema', 'network_id', 'genesis_root', 'genesis_count', 'program_id', 'authority_public_key', 'authority_tag', 'signature_algorithm']) ||
    config.schema !== 'AEGIS_PERMISSIONED_SETTLEMENT_V1' || typeof config.network_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(config.network_id) ||
    !hex(config.genesis_root) || !hex(config.program_id) || !Number.isSafeInteger(config.genesis_count) || config.genesis_count < 1 ||
    config.signature_algorithm !== FINALITY_ALGORITHM || typeof config.authority_public_key !== 'string' || config.authority_public_key.length > 8192 ||
    signerTag(config.authority_public_key, FINALITY_ALGORITHM) !== config.authority_tag ||
    exportPublicKey(createPublicKey(config.authority_public_key)) !== config.authority_public_key) throw new Error('INVALID_SETTLEMENT_CONFIG');
  return config;
}

// The wrapper validates the key algorithm; canonical SPKI prevents two config IDs
// for different text encodings of the same public key.

export function settlementConfigId(config) {
  assertSettlementConfig(config);
  return hash('AEGIS_SETTLEMENT_CONFIG_V1', config);
}

export function genesisFinality(config) {
  return { height: 0, checkpoint_id: hash('AEGIS_SETTLEMENT_GENESIS_V1', { config_id: settlementConfigId(config) }),
    root: config.genesis_root, commitment_count: config.genesis_count };
}

export function checkpointFor({ config, receipt, parent }) {
  if (!receipt || receipt.state_scope !== 'verified-stark-transition' || receipt.proof_audit?.scheme !== 'RISC0-COMPOSITE-STARK-V1' ||
    receipt.proof_audit?.program_id !== config.program_id || !hex(receipt.proof_audit.proof_digest) || receipt.height !== parent.height + 1 ||
    receipt.previous_root !== parent.root || !hex(receipt.root) || !hex(receipt.transaction_id) || !hex(receipt.transition_hash) ||
    !Number.isSafeInteger(receipt.commitment_count) || receipt.commitment_count <= parent.commitment_count) throw new Error('UNVERIFIED_OR_NONCONTIGUOUS_CHECKPOINT');
  return {
    schema: 'AEGIS_FINALITY_CHECKPOINT_V1', config_id: settlementConfigId(config), network_id: config.network_id,
    height: receipt.height, parent_checkpoint_id: parent.checkpoint_id,
    transaction_id: receipt.transaction_id, transition_hash: receipt.transition_hash,
    previous_root: receipt.previous_root, root: receipt.root, commitment_count: receipt.commitment_count,
    program_id: config.program_id, proof_digest: receipt.proof_audit.proof_digest,
  };
}

export function checkpointId(checkpoint) { return hash('AEGIS_FINALITY_CHECKPOINT_V1', checkpoint); }

// Trusted authority operation: caller must independently verify the transition.
// PersistentLedger stores this certificate atomically before releasing it.
export function signFinalityCheckpoint({ config, checkpoint, privateKey }) {
  if (signerTag(exportPublicKey(privateKey), FINALITY_ALGORITHM) !== config.authority_tag) throw new Error('WRONG_FINALITY_AUTHORITY');
  const checkpoint_id = checkpointId(checkpoint);
  const { signature } = signDigest({ algorithm: FINALITY_ALGORITHM, privateKey, messageDigest: checkpoint_id, domainTag: 'AEGIS_FINALITY_V1' });
  return { checkpoint, checkpoint_id, signature };
}

export function verifyFinalityCertificate({ config, certificate, expectedCheckpoint }) {
  try {
    assertSettlementConfig(config);
    return Boolean(exact(certificate, ['checkpoint', 'checkpoint_id', 'signature']) &&
      exact(certificate.checkpoint, Object.keys(expectedCheckpoint)) &&
      canonicalSerialize(certificate.checkpoint) === canonicalSerialize(expectedCheckpoint) &&
      certificate.checkpoint_id === checkpointId(expectedCheckpoint) &&
      verifyDigest({ algorithm: FINALITY_ALGORITHM, publicKey: config.authority_public_key, messageDigest: certificate.checkpoint_id,
        signature: certificate.signature, domainTag: 'AEGIS_FINALITY_V1' }).valid);
  } catch { return false; }
}
