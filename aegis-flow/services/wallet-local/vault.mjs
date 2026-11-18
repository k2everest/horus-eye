import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, openSync, fsyncSync, closeSync, renameSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonicalSerialize } from '../../libs/crypto-core/canonical-transcript.mjs';
import { generateSigningKeyPair, generateKemKeyPair, exportPublicKey, signerTag, kemRecipientTag } from '../../libs/crypto-core/pqc-wrapper.mjs';
import { createSpendIdentity, assertNoteV2, spendOwner } from '../../libs/crypto-core/shielded-note-v2.mjs';

const derive = promisify(crypto.scrypt);
const PARAMS = Object.freeze({ name: 'scrypt', N: 131072, r: 8, p: 1 });
const MAX_BYTES = 4 * 1024 * 1024;
const exact = (v, fields) => v && !Array.isArray(v) && Object.keys(v).sort().join(',') === fields.sort().join(',');
const bytes = (value, size) => {
  if (typeof value !== 'string' || value.length > MAX_BYTES * 2) throw new Error('INVALID_VAULT');
  const b = Buffer.from(value, 'base64');
  if (b.toString('base64') !== value || (size !== undefined && b.length !== size)) throw new Error('INVALID_VAULT');
  return b;
};
export function newWalletSecrets() {
  const signing = generateSigningKeyPair();
  const kem = generateKemKeyPair();
  return { signing_private_key: signing.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    kem_private_key: kem.privateKey.export({ type: 'pkcs8', format: 'pem' }), spend_secret: createSpendIdentity().spend_secret };
}
export function walletPublicIdentity(secrets) {
  const signing = crypto.createPrivateKey(secrets.signing_private_key);
  const kem = crypto.createPrivateKey(secrets.kem_private_key);
  const publicKey = crypto.createPublicKey(signing);
  const kemKey = crypto.createPublicKey(kem);
  return { signer_tag: signerTag(publicKey, 'ML-DSA-65'), kem_tag: kemRecipientTag(kemKey, 'ML-KEM-768'),
    kem_public_key: exportPublicKey(kemKey), owner_tag: spendOwner(secrets.spend_secret) };
}
export function assertWalletPayload(payload) {
  if (!exact(payload, ['schema', 'config_id', 'secrets', 'notes', 'pending', 'anchor']) || payload.schema !== 'AEGIS_WALLET_PRIVATE_V1' ||
    !/^[0-9a-f]{64}$/.test(payload.config_id) || !Array.isArray(payload.notes) || payload.notes.length > 4096 ||
    !Array.isArray(payload.pending) || payload.pending.length > 64 || !payload.anchor || !Number.isSafeInteger(payload.anchor.height) || payload.anchor.height < 0 ||
    !/^[0-9a-f]{64}$/.test(payload.anchor.checkpoint_id) || !exact(payload.secrets, ['signing_private_key', 'kem_private_key', 'spend_secret'])) throw new Error('INVALID_WALLET_PAYLOAD');
  const identity = walletPublicIdentity(payload.secrets);
  const seen = new Set();
  for (const note of payload.notes) {
    assertNoteV2(note);
    if (note.owner_tag !== identity.owner_tag || seen.has(canonicalSerialize(note))) throw new Error('INVALID_WALLET_NOTE');
    seen.add(canonicalSerialize(note));
  }
  for (const pending of payload.pending) {
    if (!['PREPARING', 'BROADCASTING'].includes(pending.phase) || (pending.phase === 'BROADCASTING' && (!pending.bundle?.transaction || !pending.bundle?.proof)) || !exact(pending, ['request_id', 'transaction_id', 'input_commitments', 'phase', 'bundle']) || typeof pending.request_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(pending.request_id) ||
      !/^[0-9a-f]{64}$/.test(pending.transaction_id) || !Array.isArray(pending.input_commitments) || pending.input_commitments.length < 1 || pending.input_commitments.length > 4 ||
      pending.input_commitments.some(v => typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v))) throw new Error('INVALID_WALLET_PENDING');
  }
  return payload;
}
function passphraseBytes(passphrase) {
  if (typeof passphrase !== 'string' || passphrase.length < 14 || Buffer.byteLength(passphrase) > 1024) throw new Error('PASSPHRASE_REQUIRES_AT_LEAST_14_CHARACTERS');
  return Buffer.from(passphrase, 'utf8');
}
async function deriveKey(passphrase, salt) {
  const password = passphraseBytes(passphrase);
  try { return await derive(password, salt, 32, { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: 192 * 1024 * 1024 }); }
  finally { password.fill(0); }
}
export function sealPayload(payload, session) {
  assertWalletPayload(payload);
  const header = { schema: 'AEGIS_WALLET_VAULT_V1', kdf: { ...PARAMS }, salt: session.salt.toString('base64'), nonce: crypto.randomBytes(12).toString('base64') };
  const plaintext = Buffer.from(canonicalSerialize(payload));
  if (plaintext.length > MAX_BYTES) { plaintext.fill(0); throw new Error('VAULT_TOO_LARGE'); }
  try {
    const cipher = crypto.createCipheriv('aes-256-gcm', session.key, bytes(header.nonce, 12));
    cipher.setAAD(Buffer.from(canonicalSerialize(header)));
    return { ...header, ciphertext: Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  } finally { plaintext.fill(0); }
}
export async function createEncryptedVault(payload, passphrase) {
  const salt = crypto.randomBytes(32);
  const key = await deriveKey(passphrase, salt);
  const session = { key, salt };
  try { return { envelope: sealPayload(payload, session), session }; }
  catch (error) { key.fill(0); throw error; }
}
export async function openEncryptedVault(envelope, passphrase) {
  if (!exact(envelope, ['schema', 'kdf', 'salt', 'nonce', 'ciphertext', 'tag']) || envelope.schema !== 'AEGIS_WALLET_VAULT_V1' || canonicalSerialize(envelope.kdf) !== canonicalSerialize(PARAMS)) throw new Error('INVALID_VAULT');
  const salt = bytes(envelope.salt, 32); const nonce = bytes(envelope.nonce, 12); const tag = bytes(envelope.tag, 16);
  const ciphertext = bytes(envelope.ciphertext);
  if (!ciphertext.length || ciphertext.length > MAX_BYTES) throw new Error('INVALID_VAULT');
  const key = await deriveKey(passphrase, salt);
  let plaintext;
  try {
    const { ciphertext: ignored, tag: ignoredTag, ...header } = envelope;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(Buffer.from(canonicalSerialize(header))); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { payload: assertWalletPayload(JSON.parse(plaintext.toString('utf8'))), session: { key, salt } };
  } catch { key.fill(0); throw new Error('VAULT_UNLOCK_FAILED'); }
  finally { plaintext?.fill(0); }
}
export function atomicWriteVault(filename, envelope) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const tmp = `${filename}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(tmp, 'wx', 0o600);
    writeFileSync(descriptor, JSON.stringify(envelope)); fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    renameSync(tmp, filename);
    const dir = openSync(dirname(filename), 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
  } finally { if (descriptor !== undefined) closeSync(descriptor); if (existsSync(tmp)) unlinkSync(tmp); }
}
export function readVault(filename) {
  const contents = readFileSync(filename);
  if (contents.length > MAX_BYTES * 2) throw new Error('VAULT_TOO_LARGE');
  return JSON.parse(contents.toString('utf8'));
}
