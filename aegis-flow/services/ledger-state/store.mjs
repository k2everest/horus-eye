import { DatabaseSync, backup } from 'node:sqlite';
import { migrateLedger, LEDGER_SCHEMA_VERSION } from './migrations.mjs';
import { mkdirSync, openSync, closeSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { canonicalSerialize, buildTranscriptHash } from '../../libs/crypto-core/canonical-transcript.mjs';
import { merkleRoot, createInclusionProof } from '../../libs/crypto-core/merkle-proof.mjs';
import { validateShieldedTxV1 } from '../../libs/crypto-core/validate-shielded-tx.mjs';
import { verifyTransferSignature } from '../../libs/crypto-core/transfer-v2.mjs';
import { assertSettlementConfig, settlementConfigId, genesisFinality, checkpointFor, checkpointId,
  signFinalityCheckpoint, verifyFinalityCertificate } from './finality.mjs';

const HEX = /^[0-9a-f]{64}$/;
function digest(value, name) {
  if (typeof value !== 'string' || !HEX.test(value)) throw new TypeError(`invalid ${name}`);
}
function list(values, name, { empty = false } = {}) {
  if (!Array.isArray(values) || (!empty && values.length === 0) || values.length > 64 || new Set(values).size !== values.length) {
    throw new TypeError(`invalid ${name}`);
  }
  for (const value of values) digest(value, name);
  return [...values];
}
export class LedgerConflict extends Error {
  constructor(code) { super(code); this.name = 'LedgerConflict'; this.code = code; }
}

/** Trusted storage API. This is NOT a proof verifier or a settlement endpoint. */
export class PersistentLedger {
  #db;
  #filename;
  #networkId;
  #faultInjector;
  #closed = false;

  constructor({ filename, networkId = 'aegis-lab-v1', faultInjector = () => {}, trustedFinalizedCheckpoint, allowMigrations = true }) {
    if (typeof filename !== 'string' || !filename || filename === ':memory:') throw new TypeError('persistent filename required');
    if (typeof networkId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(networkId)) throw new TypeError('invalid networkId');
    this.#filename = resolve(filename);
    this.#networkId = networkId;
    this.#faultInjector = faultInjector;
    mkdirSync(dirname(this.#filename), { recursive: true, mode: 0o700 });
    closeSync(openSync(this.#filename, 'a', 0o600));
    chmodSync(this.#filename, 0o600);
    this.#db = new DatabaseSync(this.#filename);
    try {
      this.#db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA trusted_schema=OFF;');
      if (this.#db.prepare('PRAGMA journal_mode').get().journal_mode !== 'wal') throw new Error('WAL_REQUIRED');
      this.#atomic(() => {
        migrateLedger(this.#db, { allowMigrations, faultInjector });
        const existing = this.#db.prepare("SELECT value FROM metadata WHERE key='network_id'").get();
        if (existing && existing.value !== networkId) throw new Error('LEDGER_NETWORK_MISMATCH');
        this.#db.prepare("INSERT OR IGNORE INTO metadata(key,value) VALUES('network_id',?)").run(networkId);
        this.#db.prepare('INSERT OR IGNORE INTO blocks(height,root,commitment_count) VALUES(0,?,0)').run(merkleRoot([]));
      });
      if (this.#db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('LEDGER_INTEGRITY_FAILED');
      this.#atomic(() => {
        const tip = this.latest();
        const commitments = this.#commitments(tip.height);
        if (tip.commitment_count !== commitments.length || tip.root !== merkleRoot(commitments)) throw new Error('LEDGER_ROOT_MISMATCH');
        this.#recoverFinality();
        if (trustedFinalizedCheckpoint) {
          const trusted = trustedFinalizedCheckpoint;
          if (!Number.isSafeInteger(trusted.height) || trusted.height < 0 || !HEX.test(trusted.checkpoint_id)) throw new Error('INVALID_TRUSTED_CHECKPOINT');
          const known = trusted.height === 0 ? this.settlementStatus()?.genesis : this.finalityCertificate(trusted.height);
          if (!known || known.checkpoint_id !== trusted.checkpoint_id) throw new Error('RECOVERY_BELOW_OR_CONFLICTING_WITH_TRUSTED_FINALITY');
        }
      });
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  #atomic(operation) {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #commitments(height) {
    return this.#db.prepare('SELECT commitment FROM commitments WHERE created_height <= ? ORDER BY leaf_index').all(height).map(row => row.commitment);
  }

  get schemaVersion() { return LEDGER_SCHEMA_VERSION; }

  get networkId() { return this.#networkId; }

  latest() {
    return { ...this.#db.prepare('SELECT height,root,previous_root,commitment_count FROM blocks ORDER BY height DESC LIMIT 1').get() };
  }

  snapshot(height = this.latest().height) {
    if (!Number.isSafeInteger(height) || height < 0) throw new TypeError('invalid height');
    const block = this.#db.prepare('SELECT height,root,previous_root,commitment_count FROM blocks WHERE height=?').get(height);
    return block ? { ...block, commitments: this.#commitments(height) } : undefined;
  }

  // Offline, trusted genesis only. Never exposed by the HTTP gateway.
  bootstrap({ commitments }) {
    const normalized = list(commitments, 'genesis commitments');
    return this.#atomic(() => {
      if (this.#db.prepare("SELECT 1 FROM metadata WHERE key='genesis_initialized'").get() || this.latest().height !== 0 || this.latest().commitment_count !== 0) {
        throw new LedgerConflict('GENESIS_ALREADY_INITIALIZED');
      }
      this.#db.prepare('UPDATE blocks SET root=?,commitment_count=? WHERE height=0').run(merkleRoot(normalized), normalized.length);
      const insert = this.#db.prepare('INSERT INTO commitments(commitment,leaf_index,created_height) VALUES(?,?,0)');
      normalized.forEach((value, index) => insert.run(value, index));
      this.#db.prepare("INSERT INTO metadata(key,value) VALUES('genesis_initialized','1')").run();
      return this.latest();
    });
  }

  receipt(requestId) {
    const row = this.#db.prepare('SELECT receipt_json FROM requests WHERE request_id=?').get(requestId);
    if (!row) {
      const orphan = this.#db.prepare('SELECT receipt_json FROM orphaned_requests WHERE request_id=? ORDER BY id DESC LIMIT 1').get(requestId);
      return orphan ? JSON.parse(orphan.receipt_json) : undefined;
    }
    const receipt = JSON.parse(row.receipt_json);
    const settlement = this.settlementStatus();
    if (!settlement) return receipt;
    const certificate = this.finalityCertificate(receipt.height);
    return { ...receipt, status: certificate ? 'FINALIZED_PERMISSIONED' : receipt.status,
      inclusion_status: 'INCLUDED', finality_status: certificate ? 'FINALIZED' : 'PENDING', settled: Boolean(certificate),
      settlement_scope: 'aegis-permissioned-authority', config_id: settlement.config_id,
      ...(certificate ? { checkpoint_id: certificate.checkpoint_id } : {}) };
  }

  settlementConfig() {
    const row = this.#db.prepare("SELECT value FROM metadata WHERE key='settlement_config'").get();
    return row ? JSON.parse(row.value) : undefined;
  }

  configureSettlement(config) {
    config = structuredClone(config);
    assertSettlementConfig(config);
    return this.#atomic(() => {
      const existing = this.settlementConfig();
      if (existing) {
        if (settlementConfigId(existing) !== settlementConfigId(config)) throw new LedgerConflict('SETTLEMENT_CONFIG_IMMUTABLE');
        return this.settlementStatus();
      }
      const genesis = this.snapshot(0);
      if (this.latest().height !== 0 || config.network_id !== this.#networkId || config.genesis_root !== genesis.root ||
        config.genesis_count !== genesis.commitment_count) throw new Error('SETTLEMENT_GENESIS_MISMATCH');
      this.#db.prepare("INSERT INTO metadata VALUES('settlement_config',?)").run(canonicalSerialize(config));
      // Configuration freezes genesis even when the caller used a preseeded DB.
      this.#db.prepare("INSERT OR IGNORE INTO metadata VALUES('genesis_initialized','1')").run();
      return this.settlementStatus();
    });
  }

  finalityCertificate(height) {
    if (!Number.isSafeInteger(height) || height < 1) return undefined;
    const row = this.#db.prepare('SELECT certificate_json FROM finality_certificates WHERE height=?').get(height);
    return row ? JSON.parse(row.certificate_json) : undefined;
  }

  finalizedBlock(height) {
    const certificate = this.finalityCertificate(height);
    if (!certificate) return undefined;
    const stored = this.publicTransaction(certificate.checkpoint.transaction_id);
    if (!stored) throw new Error('FINALIZED_TRANSACTION_MISSING');
    return { ...stored, certificate };
  }

  finalizedInclusionProof(commitment) {
    const state = this.settlementStatus();
    if (!state) throw new Error('SETTLEMENT_NOT_CONFIGURED');
    return { ...this.inclusionProof({ commitment, height: state.finalized.height }), config_id: state.config_id,
      checkpoint_id: state.finalized.checkpoint_id, certificate: this.finalityCertificate(state.finalized.height) ?? null,
      settlement_scope: 'aegis-permissioned-authority', production_ready: false };
  }

  settlementStatus() {
    const config = this.settlementConfig();
    if (!config) return undefined;
    const genesis = genesisFinality(config);
    const row = this.#db.prepare('SELECT height,checkpoint_id,certificate_json FROM finality_certificates ORDER BY height DESC LIMIT 1').get();
    const checkpoint = row ? JSON.parse(row.certificate_json).checkpoint : genesis;
    return { model: 'permissioned-single-authority', config_id: settlementConfigId(config), network_id: this.#networkId,
      authority_tag: config.authority_tag, genesis,
      finalized: { height: checkpoint.height, checkpoint_id: row?.checkpoint_id ?? genesis.checkpoint_id,
        root: checkpoint.root, commitment_count: checkpoint.commitment_count }, production_ready: false };
  }

  #rawReceiptAt(height) {
    const row = this.#db.prepare('SELECT r.receipt_json FROM requests r JOIN blocks b ON b.tx_id=r.tx_id WHERE b.height=?').get(height);
    return row ? JSON.parse(row.receipt_json) : undefined;
  }

  nextFinalityCheckpoint() {
    const config = this.settlementConfig();
    const state = this.settlementStatus();
    if (!config) throw new Error('SETTLEMENT_NOT_CONFIGURED');
    return checkpointFor({ config, receipt: this.#rawReceiptAt(state.finalized.height + 1), parent: state.finalized });
  }

  #acceptFinality(certificate) {
    const existing = this.finalityCertificate(certificate?.checkpoint?.height);
    if (existing) {
      if (existing.checkpoint_id !== certificate.checkpoint_id || !verifyFinalityCertificate({ config: this.settlementConfig(), certificate, expectedCheckpoint: existing.checkpoint })) {
        throw new LedgerConflict('FINALITY_CONFLICT');
      }
      return existing;
    }
    const expected = this.nextFinalityCheckpoint();
    if (!verifyFinalityCertificate({ config: this.settlementConfig(), certificate, expectedCheckpoint: expected })) throw new Error('INVALID_FINALITY_CERTIFICATE');
    this.#db.prepare('INSERT INTO finality_certificates VALUES(?,?,?)').run(expected.height, certificate.checkpoint_id, canonicalSerialize(certificate));
    this.#faultInjector('after_finality_certificate');
    return certificate;
  }

  // Public-key-only import. No HTTP operation can sign or roll back state.
  acceptFinality(certificate) {
    certificate = structuredClone(certificate);
    return this.#atomic(() => this.#acceptFinality(certificate));
  }

  // Trusted authority API: use notarizeNextTransfer to reverify the STARK first.
  // Certificate is never returned before durable COMMIT, preventing crash-driven
  // double signing while this DB and its finalized history remain intact.
  notarize({ privateKey, expectedCheckpointId }) {
    return this.#atomic(() => {
      const checkpoint = this.nextFinalityCheckpoint();
      if (checkpointId(checkpoint) !== expectedCheckpointId) throw new LedgerConflict('FINALITY_CANDIDATE_CHANGED');
      return this.#acceptFinality(signFinalityCheckpoint({ config: this.settlementConfig(), checkpoint, privateKey }));
    });
  }

  #recoverFinality() {
    const config = this.settlementConfig();
    if (!config) {
      if (this.#db.prepare('SELECT 1 FROM finality_certificates LIMIT 1').get()) throw new Error('FINALITY_CONFIG_MISSING');
      return;
    }
    assertSettlementConfig(config);
    const genesis = this.snapshot(0);
    if (config.network_id !== this.#networkId || genesis.root !== config.genesis_root || genesis.commitment_count !== config.genesis_count) throw new Error('SETTLEMENT_GENESIS_MISMATCH');
    let parent = genesisFinality(config);
    for (const row of this.#db.prepare('SELECT * FROM finality_certificates ORDER BY height').all()) {
      const receipt = this.#rawReceiptAt(row.height);
      const expected = checkpointFor({ config, receipt, parent });
      const certificate = JSON.parse(row.certificate_json);
      const snapshot = this.snapshot(row.height);
      if (!snapshot || snapshot.root !== expected.root || snapshot.previous_root !== expected.previous_root || snapshot.commitment_count !== expected.commitment_count ||
        merkleRoot(snapshot.commitments) !== expected.root || row.checkpoint_id !== certificate.checkpoint_id ||
        !verifyFinalityCertificate({ config, certificate, expectedCheckpoint: expected })) throw new Error('FINALITY_RECOVERY_FAILED');
      parent = { ...expected, checkpoint_id: certificate.checkpoint_id };
    }
  }

  // Offline trusted reorganization: discard only the entire unfinalized suffix.
  // Replacements must pass submitProvenTransfer again; finalized blocks cannot move.
  rewindToFinalized({ expectedFinalizedCheckpointId }) {
    return this.#atomic(() => {
      const state = this.settlementStatus();
      if (!state || state.finalized.checkpoint_id !== expectedFinalizedCheckpointId) throw new LedgerConflict('FINALITY_ANCHOR_MISMATCH');
      const height = state.finalized.height;
      const rows = this.#db.prepare('SELECT r.* FROM requests r JOIN blocks b ON b.tx_id=r.tx_id WHERE b.height>? ORDER BY b.height DESC').all(height);
      for (const row of rows) {
        const receipt = { ...JSON.parse(row.receipt_json), status: 'ORPHANED', inclusion_status: 'ORPHANED', finality_status: 'NOT_FINALIZED', settled: false };
        this.#db.prepare('INSERT INTO orphaned_requests(request_id,tx_id,receipt_json) VALUES(?,?,?)').run(row.request_id, row.tx_id, canonicalSerialize(receipt));
        this.#db.prepare('DELETE FROM nullifiers WHERE tx_id=?').run(row.tx_id);
        this.#db.prepare('DELETE FROM spent_inputs WHERE tx_id=?').run(row.tx_id);
        this.#db.prepare('DELETE FROM public_transactions WHERE tx_id=?').run(row.tx_id);
      }
      this.#db.prepare('DELETE FROM commitments WHERE created_height>?').run(height);
      this.#db.prepare('DELETE FROM blocks WHERE height>?').run(height);
      for (const row of rows) this.#db.prepare('DELETE FROM requests WHERE tx_id=?').run(row.tx_id);
      this.#faultInjector('after_rewind');
      return { removed: rows.length, finalized: state.finalized, tip: this.latest(), production_ready: false };
    });
  }

  verificationReceipt(requestId) {
    const row = this.#db.prepare('SELECT receipt_json FROM verifications WHERE request_id=?').get(requestId);
    return row ? JSON.parse(row.receipt_json) : undefined;
  }

  publicTransaction(transactionId) {
    digest(transactionId, 'transactionId');
    const row = this.#db.prepare('SELECT transaction_json,proof_json FROM public_transactions WHERE tx_id=?').get(transactionId);
    return row ? { transaction: JSON.parse(row.transaction_json), proof: JSON.parse(row.proof_json) } : undefined;
  }

  recordVerification(tx) {
    // This durable receipt is deliberately separate from ledger inclusion.
    if (!validateShieldedTxV1({ tx }).valid) throw new Error('INVALID_SIGNATURE_OR_SCHEMA');
    return this.#atomic(() => {
      if (this.#db.prepare('SELECT 1 FROM requests WHERE request_id=?').get(tx.request_id)) throw new LedgerConflict('REQUEST_ID_CONFLICT');
      const previous = this.#db.prepare('SELECT tx_id,receipt_json FROM verifications WHERE request_id=?').get(tx.request_id);
      if (previous) {
        if (previous.tx_id !== tx.tx_id) throw new LedgerConflict('REQUEST_ID_CONFLICT');
        return { ...JSON.parse(previous.receipt_json), replayed: true };
      }
      if (this.#db.prepare('SELECT 1 FROM verifications WHERE tx_id=?').get(tx.tx_id)) throw new LedgerConflict('TX_ID_CONFLICT');
      const receipt = {
        network_id: this.#networkId, request_id: tx.request_id, transaction_id: tx.tx_id,
        status: 'SIGNATURE_VERIFIED', signature_algorithm: tx.signature_algorithm,
        validation_scope: 'signature-and-structure-only', proof_status: 'NOT_REQUESTED',
        settled: false, production_ready: false, replayed: false,
      };
      this.#db.prepare('INSERT INTO verifications VALUES(?,?,?)').run(tx.request_id, tx.tx_id, canonicalSerialize(receipt));
      return receipt;
    });
  }

  hasNullifier(nullifier) {
    digest(nullifier, 'nullifier');
    return Boolean(this.#db.prepare('SELECT 1 FROM nullifiers WHERE nullifier=?').get(nullifier));
  }

  inclusionProof({ commitment, height = this.latest().height }) {
    digest(commitment, 'commitment');
    const snapshot = this.snapshot(height);
    if (!snapshot) throw new Error('UNKNOWN_HEIGHT');
    const index = snapshot.commitments.indexOf(commitment);
    if (index < 0) throw new Error('UNKNOWN_COMMITMENT');
    return { height, root: snapshot.root, proof: createInclusionProof(snapshot.commitments, index) };
  }

  // Internal API: caller MUST validate the cryptographic transition first.
  // It enforces atomicity/existence/uniqueness, not ownership or conservation.
  commitTransition({ transactionId, requestId, expectedRoot, inputCommitments, newCommitments, nullifiers, verification, publicTransaction, proof }) {
    digest(transactionId, 'transactionId');
    digest(expectedRoot, 'expectedRoot');
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new TypeError('invalid requestId');
    const inputs = list(inputCommitments, 'inputCommitments');
    const outputs = list(newCommitments, 'newCommitments');
    const spent = list(nullifiers, 'nullifiers');
    if (verification !== undefined) {
      if (!verification || Object.keys(verification).sort().join(',') !== 'program_id,proof_digest,scheme' || verification.scheme !== 'RISC0-COMPOSITE-STARK-V1') throw new TypeError('invalid verification audit');
      digest(verification.program_id, 'program_id');
      digest(verification.proof_digest, 'proof_digest');
      if (!verifyTransferSignature(publicTransaction) || publicTransaction.tx_id !== transactionId || publicTransaction.request_id !== requestId ||
          !proof || Object.keys(proof).sort().join(',') !== 'program_id,receipt,scheme,statement_digest' ||
          proof.scheme !== verification.scheme || proof.program_id !== verification.program_id || typeof proof.receipt !== 'string' || proof.receipt.length > 12 * 1024 * 1024) throw new TypeError('invalid public transaction/proof audit');
    }
    if (inputs.length !== spent.length) throw new TypeError('one nullifier per input is required');
    const payload = { network_id: this.#networkId, transactionId, requestId, expectedRoot, inputs, outputs, nullifiers: spent };
    const transitionHash = buildTranscriptHash({ domainTag: 'STATE_TRANSITION_V1', payload });
    return this.#atomic(() => {
      if (this.#db.prepare('SELECT 1 FROM verifications WHERE request_id=?').get(requestId)) throw new LedgerConflict('REQUEST_ID_CONFLICT');
      const previous = this.#db.prepare('SELECT transition_hash,receipt_json FROM requests WHERE request_id=?').get(requestId);
      if (previous) {
        if (previous.transition_hash !== transitionHash) throw new LedgerConflict('REQUEST_ID_CONFLICT');
        return { ...JSON.parse(previous.receipt_json), replayed: true };
      }
      if (this.#db.prepare('SELECT 1 FROM requests WHERE tx_id=?').get(transactionId)) throw new LedgerConflict('TX_ID_CONFLICT');
      const tip = this.latest();
      if (tip.root !== expectedRoot) throw new LedgerConflict('STALE_ROOT');
      for (const commitment of inputs) {
        if (!this.#db.prepare('SELECT 1 FROM commitments WHERE commitment=?').get(commitment)) throw new LedgerConflict('UNKNOWN_INPUT');
        if (this.#db.prepare('SELECT 1 FROM spent_inputs WHERE commitment=?').get(commitment)) throw new LedgerConflict('INPUT_ALREADY_SPENT');
      }
      for (const nullifier of spent) if (this.hasNullifier(nullifier)) throw new LedgerConflict('NULLIFIER_ALREADY_USED');
      for (const commitment of outputs) {
        if (this.#db.prepare('SELECT 1 FROM commitments WHERE commitment=?').get(commitment)) throw new LedgerConflict('COMMITMENT_ALREADY_EXISTS');
      }
      const commitments = [...this.#commitments(tip.height), ...outputs];
      const receipt = {
        transaction_id: transactionId, request_id: requestId, height: tip.height + 1,
        previous_root: tip.root, root: merkleRoot(commitments), commitment_count: commitments.length,
        transition_hash: transitionHash, replayed: false, settled: false, production_ready: false, state_scope: 'trusted-storage-transition',
        ...(verification ? { proof_audit: { ...verification }, state_scope: 'verified-stark-transition', status: 'APPLIED_LOCAL' } : {}),
      };
      this.#db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(requestId, transactionId, transitionHash, canonicalSerialize(receipt));
      if (verification) this.#db.prepare('INSERT INTO public_transactions VALUES(?,?,?)').run(transactionId, canonicalSerialize(publicTransaction), canonicalSerialize(proof));
      this.#db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?)').run(receipt.height, receipt.root, tip.root, commitments.length, transactionId);
      for (const nullifier of spent) this.#db.prepare('INSERT INTO nullifiers VALUES(?,?)').run(nullifier, transactionId);
      for (const commitment of inputs) this.#db.prepare('INSERT INTO spent_inputs VALUES(?,?)').run(commitment, transactionId);
      this.#faultInjector('after_nullifiers');
      outputs.forEach((commitment, i) => {
        this.#db.prepare('INSERT INTO commitments VALUES(?,?,?)').run(commitment, tip.commitment_count + i, receipt.height);
      });
      this.#faultInjector('after_outputs');
      return receipt;
    });
  }

  // Internal consensus storage primitive, never exposed by the legacy gateway.
  // The open PoW engine checks work, deterministic subsidy and the resulting root.
  appendProtocolReward(commitment) {
    digest(commitment, 'reward commitment');
    return this.#atomic(() => {
      if (this.settlementConfig()) throw new Error('REWARD_FORBIDDEN_ON_LEGACY_SETTLEMENT');
      if (this.#db.prepare('SELECT 1 FROM commitments WHERE commitment=?').get(commitment)) throw new LedgerConflict('COMMITMENT_ALREADY_EXISTS');
      const tip = this.latest();
      const root = merkleRoot([...this.#commitments(tip.height), commitment]);
      this.#db.prepare('INSERT INTO blocks VALUES(?,?,?,?,NULL)').run(tip.height + 1, root, tip.root, tip.commitment_count + 1);
      this.#db.prepare('INSERT INTO commitments VALUES(?,?,?)').run(commitment, tip.commitment_count, tip.height + 1);
      return this.latest();
    });
  }

  async backupTo(filename) {
    if (typeof filename !== 'string' || !filename || resolve(filename) === this.#filename) throw new TypeError('invalid backup path');
    mkdirSync(dirname(resolve(filename)), { recursive: true, mode: 0o700 });
    closeSync(openSync(filename, 'wx', 0o600));
    await backup(this.#db, filename);
    chmodSync(filename, 0o600);
  }

  close() {
    if (!this.#closed) { this.#db.close(); this.#closed = true; }
  }
}
