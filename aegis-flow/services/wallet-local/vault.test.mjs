import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newWalletSecrets, createEncryptedVault, openEncryptedVault, sealPayload, atomicWriteVault, readVault } from './vault.mjs';
const passphrase = 'a long unique laboratory passphrase';
const payload = () => ({ schema: 'AEGIS_WALLET_PRIVATE_V1', config_id: '12'.repeat(32), secrets: newWalletSecrets(), notes: [], pending: [], anchor: { height: 0, checkpoint_id: '34'.repeat(32) } });

test('real keys are encrypted/authenticated; wrong password, tampering and KDF substitution fail closed', async () => {
  const privateData = payload();
  const { envelope, session } = await createEncryptedVault(privateData, passphrase);
  assert.ok(!JSON.stringify(envelope).includes(privateData.secrets.spend_secret));
  assert.ok(!JSON.stringify(envelope).includes('PRIVATE KEY'));
  const opened = await openEncryptedVault(envelope, passphrase);
  assert.deepEqual(opened.payload, privateData); opened.session.key.fill(0);
  await assert.rejects(openEncryptedVault(envelope, 'a different incorrect password'), /UNLOCK_FAILED/);
  const altered = structuredClone(envelope); const bytes = Buffer.from(altered.ciphertext, 'base64'); bytes[0] ^= 1; altered.ciphertext = bytes.toString('base64');
  await assert.rejects(openEncryptedVault(altered, passphrase), /UNLOCK_FAILED/);
  await assert.rejects(openEncryptedVault({ ...envelope, kdf: { ...envelope.kdf, N: 2 ** 25 } }, passphrase), /INVALID_VAULT/);
  await assert.rejects(createEncryptedVault(privateData, 'short'), /PASSPHRASE/);
  assert.notEqual(sealPayload(privateData, session).nonce, envelope.nonce);
  session.key.fill(0);
});

test('atomic disk writes keep only encrypted data with mode 0600', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-vault-'));
  const filename = join(directory, 'vault.json');
  const { envelope, session } = await createEncryptedVault(payload(), passphrase);
  try {
    atomicWriteVault(filename, envelope);
    assert.equal(statSync(filename).mode & 0o777, 0o600);
    assert.deepEqual(readVault(filename), envelope);
  } finally { session.key.fill(0); rmSync(directory, { recursive: true, force: true }); }
});
