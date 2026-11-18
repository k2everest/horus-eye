import crypto from 'node:crypto';
import { readBearerSecret } from '../operational-security/access.mjs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { assertSettlementConfig, settlementConfigId } from '../ledger-state/finality.mjs';
import { replayFinalizedTransfer } from '../ledger-state/settlement.mjs';
import { defaultStarkBackend } from '../proof-engine/backend.mjs';
import { canonicalSerialize } from '../../libs/crypto-core/canonical-transcript.mjs';
import { noteCommitmentV2, noteNullifierV2, createPrivateNote, assertNoteV2 } from '../../libs/crypto-core/shielded-note-v2.mjs';
import { openTransferOutputV2, prepareTransferV2 } from '../../libs/crypto-core/transfer-v2.mjs';
import { proveTxV1 } from '../../libs/crypto-core/prover-v1.mjs';
import { merkleRoot } from '../../libs/crypto-core/merkle-proof.mjs';
import { kemRecipientTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { newWalletSecrets, walletPublicIdentity, createEncryptedVault, openEncryptedVault, atomicWriteVault, readVault, sealPayload } from './vault.mjs';

export function receiveAddress({ config, identity }) {
  return `aegis_receive1_${Buffer.from(canonicalSerialize({ schema: 'AEGIS_RECEIVE_V1', config_id: settlementConfigId(config),
    network_id: config.network_id, owner_tag: identity.owner_tag, kem_public_key: identity.kem_public_key })).toString('base64url')}`;
}
export function parseReceiveAddress(address, config) {
  if (typeof address !== 'string' || address.length > 8192 || !address.startsWith('aegis_receive1_')) throw new Error('INVALID_RECIPIENT_ADDRESS');
  const encoded = address.slice('aegis_receive1_'.length);
  const raw = Buffer.from(encoded, 'base64url');
  if (raw.toString('base64url') !== encoded) throw new Error('INVALID_RECIPIENT_ADDRESS');
  const value = JSON.parse(raw.toString('utf8'));
  if (canonicalSerialize(value) !== raw.toString('utf8') || Object.keys(value).sort().join(',') !== 'config_id,kem_public_key,network_id,owner_tag,schema' ||
    value.schema !== 'AEGIS_RECEIVE_V1' || value.config_id !== settlementConfigId(config) || value.network_id !== config.network_id ||
    typeof value.owner_tag !== 'string' || !/^[0-9a-f]{64}$/.test(value.owner_tag)) throw new Error('INVALID_RECIPIENT_ADDRESS');
  kemRecipientTag(value.kem_public_key, 'ML-KEM-768');
  return value;
}
export class LocalWallet {
  #config; #ledger; #vaultPath; #session; #payload; #backend; #gateway; #fetch; #synced = false; #busy = false; #trustedAnchor; #gatewayTokenFile; #closed = false;
  constructor({ directory, config, genesisCommitments, gatewayUrl, backend = defaultStarkBackend(), fetchImpl = fetch, trustedAnchor, gatewayTokenFile }) {
    assertSettlementConfig(config);
    if (!Array.isArray(genesisCommitments) || genesisCommitments.length !== config.genesis_count || merkleRoot(genesisCommitments) !== config.genesis_root) throw new Error('WALLET_GENESIS_MISMATCH');
    const gateway = new URL(gatewayUrl);
    if (gateway.username || gateway.password || gateway.search || gateway.hash || gateway.pathname !== '/' ||
      (gateway.protocol !== 'https:' && !(gateway.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(gateway.hostname)))) throw new Error('WALLET_GATEWAY_REQUIRES_HTTPS_OR_LOOPBACK');
    this.#trustedAnchor = trustedAnchor ? structuredClone(trustedAnchor) : undefined;
    if (trustedAnchor && (!Number.isSafeInteger(trustedAnchor.height) || trustedAnchor.height < 0 || !/^[0-9a-f]{64}$/.test(trustedAnchor.checkpoint_id))) throw new Error('INVALID_WALLET_TRUSTED_ANCHOR');
    this.#gatewayTokenFile = gatewayTokenFile;
    this.#config = structuredClone(config); this.#backend = backend; this.#gateway = gateway.origin; this.#fetch = fetchImpl;
    this.#vaultPath = join(directory, 'wallet.vault.json');
    this.#ledger = new PersistentLedger({ filename: join(directory, 'verified-ledger.sqlite'), networkId: config.network_id });
    try {
      if (!this.#ledger.settlementStatus()) {
        if (this.#ledger.latest().commitment_count === 0) this.#ledger.bootstrap({ commitments: genesisCommitments });
        this.#ledger.configureSettlement(config);
      }
      if (this.#ledger.settlementStatus().config_id !== settlementConfigId(config)) throw new Error('WALLET_CONFIG_MISMATCH');
    } catch (error) { this.#ledger.close(); throw error; }
  }
  get busy() { return this.#busy; }
  get locked() { return !this.#payload; }
  async #exclusive(operation) {
    if (this.#busy) throw new Error('WALLET_BUSY');
    this.#busy = true;
    try { const result = await operation(); return { ...result, busy: false }; } finally { this.#busy = false; }
  }
  #unlocked() { if (!this.#payload) throw new Error('WALLET_LOCKED'); }
  #save() { atomicWriteVault(this.#vaultPath, sealPayload(this.#payload, this.#session)); }
  async create(passphrase) {
    return this.#exclusive(async () => {
      if (existsSync(this.#vaultPath)) throw new Error('WALLET_ALREADY_EXISTS');
      const payload = { schema: 'AEGIS_WALLET_PRIVATE_V1', config_id: settlementConfigId(this.#config), secrets: newWalletSecrets(), notes: [], pending: [], anchor: this.#ledger.settlementStatus().finalized };
      const { envelope, session } = await createEncryptedVault(payload, passphrase);
      try { atomicWriteVault(this.#vaultPath, envelope); } catch (error) { session.key.fill(0); throw error; }
      this.#payload = payload; this.#session = session; this.#synced = false;
      return this.status();
    });
  }
  async unlock(passphrase) {
    return this.#exclusive(async () => {
      if (this.#payload) throw new Error('WALLET_ALREADY_UNLOCKED');
      const opened = await openEncryptedVault(readVault(this.#vaultPath), passphrase);
      try {
        if (opened.payload.config_id !== settlementConfigId(this.#config)) throw new Error('WALLET_CONFIG_MISMATCH');
        const anchor = opened.payload.anchor;
        const known = anchor.height === 0 ? this.#ledger.settlementStatus().genesis : this.#ledger.finalityCertificate(anchor.height);
        // A deleted/older replica must be recovered from verified bundles before
        // it can satisfy this encrypted backup's watermark.
        if (known && known.checkpoint_id !== anchor.checkpoint_id) throw new Error('WALLET_FINALITY_CONFLICT');
        opened.payload.pending = opened.payload.pending.filter(p => p.phase !== 'PREPARING');
        this.#payload = opened.payload; this.#session = opened.session; this.#synced = false;
      } catch (error) { opened.session.key.fill(0); throw error; }
      return this.status();
    });
  }
  lock() {
    if (this.#busy) throw new Error('WALLET_BUSY');
    this.#session?.key.fill(0); this.#session = undefined; this.#payload = undefined; this.#synced = false;
    return this.status();
  }
  backup() { if (this.#busy) throw new Error('WALLET_BUSY'); return readVault(this.#vaultPath); }
  async restore({ envelope, passphrase }) {
    return this.#exclusive(async () => {
      if (existsSync(this.#vaultPath)) throw new Error('RESTORE_REQUIRES_EMPTY_PROFILE');
      envelope = structuredClone(envelope);
      const opened = await openEncryptedVault(envelope, passphrase);
      try {
        if (opened.payload.config_id !== settlementConfigId(this.#config)) throw new Error('WALLET_CONFIG_MISMATCH');
        // Restore freshly encrypts with a new nonce; status stays unsynchronized.
        atomicWriteVault(this.#vaultPath, sealPayload(opened.payload, opened.session));
        opened.payload.pending = opened.payload.pending.filter(p => p.phase !== 'PREPARING');
        this.#payload = opened.payload; this.#session = opened.session; this.#synced = false;
      } catch (error) { opened.session.key.fill(0); throw error; }
      return this.status();
    });
  }
  async changePassphrase(passphrase) {
    return this.#exclusive(async () => {
      this.#unlocked();
      const { envelope, session } = await createEncryptedVault(this.#payload, passphrase);
      try { atomicWriteVault(this.#vaultPath, envelope); } catch (error) { session.key.fill(0); throw error; }
      this.#session.key.fill(0); this.#session = session;
      return this.status();
    });
  }
  #owned() {
    const reserved = new Set(this.#payload.pending.flatMap(p => p.input_commitments));
    return this.#payload.notes.map(note => {
      const commitment = noteCommitmentV2(note);
      let included = false;
      try { this.#ledger.inclusionProof({ commitment }); included = true; } catch { /* unconfirmed opening */ }
      const spent = included && this.#ledger.hasNullifier(noteNullifierV2(note, this.#payload.secrets.spend_secret));
      return { note, commitment, included, spent, reserved: reserved.has(commitment) };
    });
  }
  status() {
    const base = { exists: existsSync(this.#vaultPath), locked: this.locked, busy: this.#busy, network_id: this.#config.network_id,
      config_id: settlementConfigId(this.#config), finalized: this.#ledger.settlementStatus().finalized, synchronized: this.#synced,
      production_ready: false, settlement_scope: 'aegis-permissioned-authority' };
    if (!this.#payload) return base;
    const balances = {};
    for (const owned of this.#owned()) {
      if (!owned.included || owned.spent) continue;
      const entry = balances[owned.note.asset_id] ??= { confirmed: 0n, reserved: 0n, available: 0n };
      entry.confirmed += BigInt(owned.note.value);
      entry[owned.reserved ? 'reserved' : 'available'] += BigInt(owned.note.value);
    }
    return { ...base, address: receiveAddress({ config: this.#config, identity: walletPublicIdentity(this.#payload.secrets) }),
      balances: Object.fromEntries(Object.entries(balances).map(([asset, amounts]) => [asset, Object.fromEntries(Object.entries(amounts).map(([key, value]) => [key, value.toString()]))])),
      pending: this.#payload.pending.map(({ request_id, transaction_id }) => ({ request_id, transaction_id })) };
  }
  async #request(path, body) {
    const response = await this.#fetch(`${this.#gateway}${path}`, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(this.#gatewayTokenFile ? { authorization: `Bearer ${readBearerSecret(this.#gatewayTokenFile)}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GATEWAY_HTTP_${response.status}`);
    // Bound an untrusted gateway before JSON allocation, even without Content-Length.
    if (!response.body) throw new Error('GATEWAY_EMPTY_RESPONSE');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > 12 * 1024 * 1024) throw new Error('GATEWAY_RESPONSE_TOO_LARGE'); chunks.push(Buffer.from(value)); } }
    finally { await reader.cancel(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  #scan() {
    const secrets = this.#payload.secrets;
    const identity = walletPublicIdentity(secrets);
    const key = crypto.createPrivateKey(secrets.kem_private_key);
    const notes = new Map(this.#payload.notes.map(note => [noteCommitmentV2(note), note]));
    const head = this.#ledger.settlementStatus().finalized.height;
    for (let height = 1; height <= head; height++) {
      const { transaction } = this.#ledger.finalizedBlock(height);
      for (const [index, output] of transaction.encrypted_outputs.entries()) {
        if (output.recipient_tag !== identity.kem_tag) continue;
        try {
          const opened = openTransferOutputV2({ transaction, index, recipientPrivateKey: key, spendSecret: secrets.spend_secret });
          notes.set(opened.commitment, opened.note);
        } catch { /* Signed ciphertext can contain an invalid note: never credit it. */ }
      }
    }
    this.#payload.notes = [...notes.values()];
    this.#payload.pending = this.#payload.pending.filter(p => !this.#ledger.publicTransaction(p.transaction_id) &&
      !(p.phase === 'BROADCASTING' && p.bundle.transaction.anchor_state_root !== this.#ledger.latest().root));
  }
  async #sync() {
    this.#unlocked(); this.#synced = false;
    try {
      const remote = await this.#request('/settlement/status');
      const local = this.#ledger.settlementStatus().finalized;
      if (remote.config_id !== settlementConfigId(this.#config) || remote.network_id !== this.#config.network_id || !remote.finalized ||
        !Number.isSafeInteger(remote.finalized.height) || remote.finalized.height < local.height || remote.finalized.height < this.#payload.anchor.height || remote.finalized.height < (this.#trustedAnchor?.height ?? 0) ||
        !/^[0-9a-f]{64}$/.test(remote.finalized.checkpoint_id)) throw new Error('UNTRUSTED_OR_STALE_GATEWAY_HEAD');
      const target = Math.min(remote.finalized.height, local.height + 128);
      for (let height = local.height + 1; height <= target; height++) {
        const bundle = await this.#request(`/settlement/blocks/${height}`);
        await replayFinalizedTransfer({ ledger: this.#ledger, ...bundle, backend: this.#backend });
      }
      const head = this.#ledger.settlementStatus().finalized;
      if (head.height === remote.finalized.height && head.checkpoint_id !== remote.finalized.checkpoint_id) throw new Error('GATEWAY_FINALITY_CONFLICT');
      if (this.#trustedAnchor) {
        if (head.height < this.#trustedAnchor.height) return this.status();
        const trusted = this.#trustedAnchor.height === 0 ? this.#ledger.settlementStatus().genesis : this.#ledger.finalityCertificate(this.#trustedAnchor.height);
        if (!trusted || trusted.checkpoint_id !== this.#trustedAnchor.checkpoint_id) throw new Error('WALLET_EXTERNAL_FINALITY_CONFLICT');
      }
      const anchor = this.#payload.anchor;
      const known = anchor.height === 0 ? this.#ledger.settlementStatus().genesis : this.#ledger.finalityCertificate(anchor.height);
      if (head.height < anchor.height) return this.status();
      if (!known || known.checkpoint_id !== anchor.checkpoint_id) throw new Error('WALLET_RECOVERY_BELOW_TRUSTED_FINALITY');
      this.#scan(); this.#payload.anchor = head; this.#save(); this.#synced = head.height === remote.finalized.height;
      return this.status();
    } catch (error) {
      // A failed certificate may have left a valid inclusion pending. It must not
      // enter a wallet balance or the next candidate state.
      this.#ledger.rewindToFinalized({ expectedFinalizedCheckpointId: this.#ledger.settlementStatus().finalized.checkpoint_id });
      throw error;
    }
  }
  sync() { return this.#exclusive(() => this.#sync()); }
  importGenesisNote(note) {
    if (this.#busy) throw new Error('WALLET_BUSY'); this.#unlocked();
    note = structuredClone(note); assertNoteV2(note);
    if (note.owner_tag !== walletPublicIdentity(this.#payload.secrets).owner_tag || !this.#ledger.snapshot(0).commitments.includes(noteCommitmentV2(note))) throw new Error('UNOWNED_OR_NON_GENESIS_NOTE');
    if (!this.#payload.notes.some(n => noteCommitmentV2(n) === noteCommitmentV2(note))) this.#payload.notes.push(note);
    this.#save(); return this.status();
  }
  send({ recipient, assetId, amount }) {
    return this.#exclusive(async () => {
      this.#unlocked();
      const destination = parseReceiveAddress(recipient, this.#config);
      if (typeof amount !== 'string' || !/^[1-9][0-9]{0,15}$/.test(amount) || !Number.isSafeInteger(Number(amount)) ||
        typeof assetId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) throw new Error('INVALID_INTEGER_AMOUNT_OR_ASSET');
      await this.#sync();
      if (!this.#synced) throw new Error('WALLET_CATCH_UP_REQUIRED');
      if (this.#payload.pending.length) throw new Error('PENDING_TRANSFER_MUST_BE_RESOLVED');
      const candidates = this.#owned().filter(n => n.included && !n.spent && !n.reserved && n.note.asset_id === assetId).sort((a, b) => b.note.value - a.note.value);
      const chosen = []; let total = 0n;
      for (const entry of candidates.slice(0, 4)) { chosen.push(entry); total += BigInt(entry.note.value); if (total >= BigInt(amount)) break; }
      if (total < BigInt(amount) || total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('INSUFFICIENT_VERIFIED_FUNDS_OR_INPUT_LIMIT');
      const identity = walletPublicIdentity(this.#payload.secrets);
      const outputs = [{ note: createPrivateNote({ ownerTag: destination.owner_tag, value: Number(amount), assetId }), recipientPublicKey: crypto.createPublicKey(destination.kem_public_key) }];
      if (total > BigInt(amount)) outputs.push({ note: createPrivateNote({ ownerTag: identity.owner_tag, value: Number(total - BigInt(amount)), assetId }), recipientPublicKey: crypto.createPublicKey(identity.kem_public_key) });
      const prepared = prepareTransferV2({ requestId: crypto.randomUUID(), networkId: this.#config.network_id, anchorStateRoot: this.#ledger.latest().root,
        privateKey: crypto.createPrivateKey(this.#payload.secrets.signing_private_key), inputs: chosen.map(entry => ({ note: entry.note, spend_secret: this.#payload.secrets.spend_secret,
          membership: this.#ledger.inclusionProof({ commitment: entry.commitment }).proof })), outputs });
      // Reserve durably BEFORE proving/submitting. Transport failures never release
      // a possible in-flight spend. Restore/restart preserves this reservation.
      this.#payload.pending.push({ request_id: prepared.transaction.request_id, transaction_id: prepared.transaction.tx_id, input_commitments: chosen.map(entry => entry.commitment), phase: 'PREPARING', bundle: null });
      this.#save();
      const proved = await proveTxV1({ ...prepared, backend: this.#backend });
      if (!proved.ok) { this.#payload.pending = []; this.#save(); throw new Error(proved.error); }
      const bundle = { transaction: prepared.transaction, proof: proved.proof };
      this.#payload.pending[0].phase = 'BROADCASTING'; this.#payload.pending[0].bundle = bundle; this.#save();
      await this.#broadcast(bundle);
      this.#synced = false;
      return this.status();
    });
  }
  async #broadcast(bundle) {
    const result = await this.#request('/submit', bundle);
    if (result.valid !== true || result.receipt?.transaction_id !== bundle.transaction.tx_id) throw new Error('GATEWAY_SUBMISSION_NOT_CONFIRMED');
  }
  retryPending() {
    return this.#exclusive(async () => {
      await this.#sync();
      if (!this.#synced) throw new Error('WALLET_CATCH_UP_REQUIRED');
      const pending = this.#payload.pending[0];
      if (pending?.phase === 'BROADCASTING') { await this.#broadcast(pending.bundle); this.#synced = false; }
      return this.status();
    });
  }
  close() {
    if (this.#closed) return;
    if (this.#busy) throw new Error('WALLET_BUSY');
    this.#session?.key.fill(0); this.#session = undefined; this.#payload = undefined;
    this.#ledger.close(); this.#closed = true;
  }
}
