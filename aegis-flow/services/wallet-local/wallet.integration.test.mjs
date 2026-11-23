import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalWallet, receiveAddress } from './wallet.mjs';
import { newWalletSecrets, walletPublicIdentity, createEncryptedVault } from './vault.mjs';
import { PersistentLedger } from '../ledger-state/store.mjs';
import { settlementConfigId } from '../ledger-state/finality.mjs';
import { submitProvenTransfer } from '../ledger-state/submit-transfer.mjs';
import { notarizeNextTransfer } from '../ledger-state/settlement.mjs';
import { StarkBackend } from '../proof-engine/backend.mjs';
import { generateSigningKeyPair, signerTag, exportPublicKey } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { createPrivateNote, noteCommitmentV2 } from '../../libs/crypto-core/shielded-note-v2.mjs';

test('native wallet: real STARK send, authenticated receipt, change, recipient and restored balance', { skip: process.env.AEGIS_WALLET_INTEGRATION !== '1', timeout: 660_000 }, async () => {
  const backend = new StarkBackend();
  assert.equal(backend.availableForProving(), true, 'configure real prover and verifier first');
  const directory = mkdtempSync(join(tmpdir(), 'aegis-native-wallet-'));
  const ledger = new PersistentLedger({ filename: join(directory, 'authority.sqlite') });
  const wallets = [];
  try {
    const authority = generateSigningKeyPair();
    const sender = newWalletSecrets(); const recipient = newWalletSecrets();
    const note = createPrivateNote({ ownerTag: walletPublicIdentity(sender).owner_tag, value: 7 });
    const genesisCommitments = [noteCommitmentV2(note)];
    const genesis = ledger.bootstrap({ commitments: genesisCommitments });
    const config = { schema: 'AEGIS_PERMISSIONED_SETTLEMENT_V1', network_id: ledger.networkId, genesis_root: genesis.root, genesis_count: 1,
      program_id: backend.programId, authority_public_key: exportPublicKey(authority.publicKey), authority_tag: signerTag(authority.publicKey), signature_algorithm: 'ML-DSA-65' };
    ledger.configureSettlement(config);
    const fetchImpl = async (url, options) => {
      const path = new URL(url).pathname;
      if (path === '/settlement/status') return Response.json(ledger.settlementStatus());
      if (path.startsWith('/settlement/blocks/')) return Response.json(ledger.finalizedBlock(Number(path.split('/').at(-1))));
      if (path === '/submit') {
        assert.ok(!options.body.includes(sender.spend_secret)); assert.ok(!options.body.includes(note.randomness)); assert.ok(!options.body.includes('PRIVATE KEY'));
        const result = await submitProvenTransfer({ ledger, ...JSON.parse(options.body), backend });
        assert.equal(result.valid, true); return Response.json(result);
      }
      throw new Error('UNEXPECTED_NATIVE_TEST_REQUEST');
    };
    const passphrase = 'native laboratory encrypted wallet passphrase';
    const make = async (name, secrets, backup) => {
      const wallet = new LocalWallet({ directory: join(directory, name), config, genesisCommitments, gatewayUrl: 'http://127.0.0.1:8081', backend, fetchImpl }); wallets.push(wallet);
      if (!backup) {
        const created = await createEncryptedVault({ schema: 'AEGIS_WALLET_PRIVATE_V1', config_id: settlementConfigId(config), secrets, notes: [], pending: [], anchor: ledger.settlementStatus().genesis }, passphrase);
        backup = created.envelope; created.session.key.fill(0);
      }
      await wallet.restore({ envelope: backup, passphrase }); return wallet;
    };
    const wallet = await make('sender', sender); wallet.importGenesisNote(note);
    const backup = wallet.backup();
    assert.equal((await wallet.sync()).balances.AEGIS.available, '7');
    const address = receiveAddress({ config, identity: walletPublicIdentity(recipient) });
    assert.equal((await wallet.send({ recipient: address, assetId: 'AEGIS', amount: '3' })).balances.AEGIS.reserved, '7');
    assert.equal(ledger.latest().height, 1); assert.equal(wallet.status().finalized.height, 0);
    await notarizeNextTransfer({ ledger, privateKey: authority.privateKey, backend });
    assert.equal((await wallet.sync()).balances.AEGIS.available, '4');
    const receiver = await make('receiver', recipient); assert.equal((await receiver.sync()).balances.AEGIS.available, '3');
    const restored = await make('restored', undefined, backup); assert.equal((await restored.sync()).balances.AEGIS.available, '4');
  } finally { for (const wallet of wallets) wallet.close(); ledger.close(); rmSync(directory, { recursive: true, force: true }); }
});
