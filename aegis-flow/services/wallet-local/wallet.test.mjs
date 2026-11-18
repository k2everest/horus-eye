import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalWallet, receiveAddress } from './wallet.mjs';
import { newWalletSecrets, walletPublicIdentity, createEncryptedVault } from './vault.mjs';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { settlementConfigId } from '../ledger-state/finality.mjs';
import { notarizeNextTransfer } from '../ledger-state/settlement.mjs';
import { submitProvenTransfer } from '../ledger-state/submit-transfer.mjs';
import { generateSigningKeyPair, exportPublicKey, signerTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { createPrivateNote, noteCommitmentV2 } from '../../libs/crypto-core/shielded-note-v2.mjs';
import { starkStatementDigest } from '../../libs/crypto-core/stark-statement.mjs';

const passphrase = 'a long laboratory wallet password';
const programId = '42'.repeat(32);
// Explicit test-only prover/verifier; native proof integration is separate.
const backend = { programId, availableForVerification: () => true, availableForProving: () => true,
  prove: async ({ statement }) => ({ scheme: 'RISC0-COMPOSITE-STARK-V1', program_id: programId, statement_digest: starkStatementDigest(statement), receipt: Buffer.from(starkStatementDigest(statement)).toString('base64') }),
  verify: async ({ statement, proof }) => ({ valid: proof.receipt === Buffer.from(starkStatementDigest(statement)).toString('base64'), program_id: programId,
    proof_digest: crypto.createHash('sha256').update(Buffer.from(proof.receipt, 'base64')).digest('hex') }) };
async function setup(t) {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-wallet-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const secrets = newWalletSecrets(); const identity = walletPublicIdentity(secrets);
  const note = createPrivateNote({ ownerTag: identity.owner_tag, value: 7 });
  const authority = generateSigningKeyPair();
  const ledger = new PersistentLedger({ filename: join(directory, 'authority.sqlite') });
  t.after(() => ledger.close());
  const genesis = ledger.bootstrap({ commitments: [noteCommitmentV2(note)] });
  const config = { schema: 'AEGIS_PERMISSIONED_SETTLEMENT_V1', network_id: ledger.networkId, genesis_root: genesis.root, genesis_count: 1,
    program_id: programId, authority_public_key: exportPublicKey(authority.publicKey), authority_tag: signerTag(authority.publicKey), signature_algorithm: 'ML-DSA-65' };
  ledger.configureSettlement(config);
  let gatewayToken = '09'.repeat(32); const gatewayTokenFile = join(directory, 'gateway.token');
  writeFileSync(gatewayTokenFile, gatewayToken, { mode: 0o600 });
  let failTransport = false; let badHead = false; let badCertificate = false; const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.authorization, `Bearer ${gatewayToken}`);
    const path = new URL(url).pathname;
    requests.push({ path, body: options.body });
    if (path === '/settlement/status') return Response.json(badHead ? { ...ledger.settlementStatus(), config_id: '00'.repeat(32) } : ledger.settlementStatus());
    if (path.startsWith('/settlement/blocks/')) { const bundle = ledger.finalizedBlock(Number(path.split('/').at(-1))); if (badCertificate) bundle.certificate.signature = '00'; return Response.json(bundle); }
    if (path === '/submit') {
      const result = await submitProvenTransfer({ ledger, ...JSON.parse(options.body), backend });
      if (failTransport) throw new Error('TEST_CONNECTION_LOST_AFTER_ACCEPTANCE');
      return Response.json(result, { status: result.valid ? 200 : 409 });
    }
    throw new Error('UNEXPECTED_TEST_REQUEST');
  };
  const createWallet = async (name, privateSecrets = secrets, backup) => {
    const wallet = new LocalWallet({ directory: join(directory, name), config, genesisCommitments: [noteCommitmentV2(note)], gatewayUrl: 'http://127.0.0.1:8081', backend, fetchImpl, gatewayTokenFile });
    t.after(() => wallet.close());
    if (backup) await wallet.restore({ envelope: backup, passphrase });
    else {
      const { envelope, session } = await createEncryptedVault({ schema: 'AEGIS_WALLET_PRIVATE_V1', config_id: settlementConfigId(config), secrets: privateSecrets,
        notes: [], pending: [], anchor: ledger.settlementStatus().genesis }, passphrase);
      session.key.fill(0); await wallet.restore({ envelope, passphrase });
    }
    return wallet;
  };
  const wallet = await createWallet('sender');
  return { directory, wallet, note, ledger, config, secrets, createWallet, requests,
    badCertificate: value => { badCertificate = value; },
    rotateGatewayToken: () => { gatewayToken = '10'.repeat(32); writeFileSync(gatewayTokenFile, gatewayToken); },
    failTransport: value => { failTransport = value; }, badHead: value => { badHead = value; },
    finalize: () => notarizeNextTransfer({ ledger, privateKey: authority.privateKey, backend }) };
}

test('no fabricated balance; only owned, included notes count and lock hides all wallet data', async t => {
  const f = await setup(t);
  assert.deepEqual((await f.wallet.sync()).balances, {});
  f.rotateGatewayToken(); await f.wallet.sync();
  assert.throws(() => f.wallet.importGenesisNote({ ...f.note, value: 99 }), /UNOWNED_OR_NON_GENESIS/);
  f.wallet.importGenesisNote(f.note);
  assert.equal(f.wallet.status().balances.AEGIS.available, '7');
  assert.ok(!JSON.stringify(f.wallet.status()).includes(f.secrets.spend_secret));
  assert.equal(f.wallet.lock().address, undefined);
  await assert.rejects(f.wallet.sync(), /LOCKED/);
  await f.wallet.unlock(passphrase);
  assert.equal(f.wallet.status().synchronized, false);
  f.badHead(true); await assert.rejects(f.wallet.sync(), /UNTRUSTED/);
  assert.equal(f.wallet.status().synchronized, false);
});

test('real signing/encryption, reservation, idempotent retry, finalized balance and old-backup recovery', async t => {
  const f = await setup(t); f.wallet.importGenesisNote(f.note);
  const earlyBackup = f.wallet.backup();
  const recipientSecrets = newWalletSecrets();
  const destination = receiveAddress({ config: f.config, identity: walletPublicIdentity(recipientSecrets) });
  f.failTransport(true);
  await assert.rejects(f.wallet.send({ recipient: destination, assetId: 'AEGIS', amount: '3' }), /CONNECTION_LOST/);
  assert.equal(f.wallet.status().balances.AEGIS.reserved, '7');
  assert.equal(f.wallet.status().balances.AEGIS.available, '0');
  const pendingBackup = f.wallet.backup();
  f.wallet.lock(); await f.wallet.unlock(passphrase);
  await assert.rejects(f.wallet.send({ recipient: destination, assetId: 'AEGIS', amount: '1' }), /PENDING_TRANSFER/);
  f.failTransport(false); await f.wallet.retryPending();
  assert.equal(f.ledger.latest().height, 1);
  assert.equal(f.wallet.status().pending.length, 1);
  const sent = f.requests.filter(r => r.path === '/submit');
  assert.deepEqual(JSON.parse(sent[0].body), JSON.parse(sent[1].body));
  const publicRequests = JSON.stringify(f.requests);
  assert.ok(!publicRequests.includes(f.secrets.spend_secret));
  assert.ok(!publicRequests.includes('PRIVATE KEY'));
  assert.ok(!publicRequests.includes(f.note.randomness));
  await f.finalize();
  f.badCertificate(true); await assert.rejects(f.wallet.sync(), /INVALID_RECOVERY_CERTIFICATE/);
  assert.equal(f.wallet.status().finalized.height, 0);
  assert.equal(f.wallet.status().balances.AEGIS.available, '0');
  f.badCertificate(false);
  assert.equal((await f.wallet.sync()).balances.AEGIS.available, '4');
  assert.equal(f.wallet.status().pending.length, 0);
  const ownRequest = JSON.parse(sent[0].body).transaction.request_id;
  const evidence = f.wallet.confirmationEvidence(ownRequest);
  assert.equal(evidence.receipt.settled, true);
  assert.ok(!JSON.stringify(evidence).includes(f.secrets.spend_secret));
  const recipient = await f.createWallet('recipient', recipientSecrets);
  assert.equal((await recipient.sync()).balances.AEGIS.available, '3');
  assert.equal(recipient.confirmationEvidence(ownRequest), undefined);
  const restored = await f.createWallet('old-backup', undefined, earlyBackup);
  assert.equal(restored.status().synchronized, false);
  assert.equal((await restored.sync()).balances.AEGIS.available, '4');
  const pendingRestored = await f.createWallet('pending-backup', undefined, pendingBackup);
  assert.equal((await pendingRestored.sync()).pending.length, 0);
  await assert.rejects(restored.restore({ envelope: earlyBackup, passphrase }), /EMPTY_PROFILE/);
});

test('new wallet backup/restoration and password rotation preserve identity without old password access', async t => {
  const f = await setup(t);
  const wallet = new LocalWallet({ directory: join(f.directory, 'fresh'), config: f.config, genesisCommitments: [noteCommitmentV2(f.note)], gatewayUrl: 'http://127.0.0.1:8081', backend,
    fetchImpl: async () => Response.json(f.ledger.settlementStatus()) });
  t.after(() => wallet.close());
  const created = await wallet.create(passphrase); assert.equal(created.busy, false); const address = created.address;
  await assert.rejects(wallet.create(passphrase), /ALREADY_EXISTS/);
  await wallet.changePassphrase('a new long rotated wallet passphrase'); wallet.lock();
  await assert.rejects(wallet.unlock(passphrase), /UNLOCK_FAILED/);
  assert.equal((await wallet.unlock('a new long rotated wallet passphrase')).address, address);
});
