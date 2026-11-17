import crypto from 'node:crypto';
import { encapsulate, decapsulate, decodeHex } from './pqc-wrapper.mjs';
import { SUPPORTED_KEM } from './pqc-wrapper.mjs';

const VERSION = 'AEGIS-SEALED-V1';
const MAX_PLAINTEXT = 65536;
const FIELDS = ['version', 'kem_algorithm', 'kem_ciphertext', 'nonce', 'context', 'ciphertext', 'auth_tag'];
const KEM_BYTES = { 'ML-KEM-512': 768, 'ML-KEM-768': 1088, 'ML-KEM-1024': 1568 };

// Public framing only: this does not authenticate or decrypt the envelope.
export function assertEnvelopeShape(envelope) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).length !== FIELDS.length || FIELDS.some(field => !Object.hasOwn(envelope, field)) ||
      envelope.version !== VERSION || !SUPPORTED_KEM.includes(envelope.kem_algorithm)) throw new Error('invalid envelope');
  validateContext(envelope.context);
  decodeHex(envelope.kem_ciphertext, 'KEM ciphertext', KEM_BYTES[envelope.kem_algorithm]);
  decodeHex(envelope.nonce, 'nonce', 12);
  decodeHex(envelope.auth_tag, 'auth_tag', 16);
  if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > MAX_PLAINTEXT * 2) throw new Error('oversized ciphertext');
  decodeHex(envelope.ciphertext, 'ciphertext');
}

function validateContext(context) {
  if (typeof context !== 'string' || Buffer.byteLength(context) > 1024) throw new TypeError('invalid encryption context');
}

function header(envelope) {
  return Buffer.from(JSON.stringify([
    envelope.version, envelope.kem_algorithm, envelope.kem_ciphertext, envelope.nonce, envelope.context,
  ]), 'utf8');
}

function deriveKey(secret, ciphertext, aad) {
  return Buffer.from(crypto.hkdfSync('sha256', secret,
    crypto.createHash('sha256').update(Buffer.from(ciphertext, 'hex')).digest(),
    Buffer.concat([Buffer.from(`${VERSION}\0`), crypto.createHash('sha256').update(aad).digest()]), 32));
}

export function sealEnvelope({ plaintext, recipientPublicKey, algorithm = 'ML-KEM-768', context }) {
  validateContext(context);
  if (!(plaintext instanceof Uint8Array) || plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT) {
    throw new TypeError('plaintext must contain 1..65536 bytes');
  }
  const kem = encapsulate({ algorithm, recipientPublicKey });
  let key;
  try {
    const envelope = {
      version: VERSION, kem_algorithm: algorithm, kem_ciphertext: kem.ciphertext,
      nonce: crypto.randomBytes(12).toString('hex'), context,
    };
    const aad = header(envelope);
    key = deriveKey(kem.shared_secret, kem.ciphertext, aad);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'hex'));
    cipher.setAAD(aad);
    envelope.ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]).toString('hex');
    envelope.auth_tag = cipher.getAuthTag().toString('hex');
    return envelope;
  } finally {
    kem.shared_secret.fill(0);
    key?.fill(0);
  }
}

export function openEnvelope({ envelope, recipientPrivateKey, expectedContext }) {
  let secret;
  let key;
  let pending;
  try {
    validateContext(expectedContext);
    assertEnvelopeShape(envelope);
    if (envelope.context !== expectedContext) throw new Error('invalid context');
    const nonce = decodeHex(envelope.nonce, 'nonce', 12);
    const tag = decodeHex(envelope.auth_tag, 'auth_tag', 16);
    if (typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > MAX_PLAINTEXT * 2) throw new Error('oversized ciphertext');
    const ciphertext = decodeHex(envelope.ciphertext, 'ciphertext');
    secret = decapsulate({
      algorithm: envelope.kem_algorithm, recipientPrivateKey, ciphertext: envelope.kem_ciphertext,
    }).shared_secret;
    const aad = header(envelope);
    key = deriveKey(secret, envelope.kem_ciphertext, aad);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    pending = decipher.update(ciphertext);
    const final = decipher.final(); // Never expose plaintext before authentication.
    return Buffer.concat([pending, final]);
  } catch {
    // Same failure for wrong key, invalid framing, tampering and context mismatch.
    throw new Error('ENVELOPE_AUTHENTICATION_FAILED');
  } finally {
    secret?.fill(0);
    key?.fill(0);
    pending?.fill(0);
  }
}
