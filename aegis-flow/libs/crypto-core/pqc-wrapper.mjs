import crypto from 'node:crypto';

export const CRYPTO_VERSION = 'AEGIS-PQC-V1';
export const SUPPORTED_SIG = Object.freeze(['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87']);
export const SUPPORTED_KEM = Object.freeze(['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024']);
const SIGNATURE_BYTES = { 'ML-DSA-44': 2420, 'ML-DSA-65': 3309, 'ML-DSA-87': 4627 };
const CIPHERTEXT_BYTES = { 'ML-KEM-512': 768, 'ML-KEM-768': 1088, 'ML-KEM-1024': 1568 };

export function assertPqcRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 8) || typeof crypto.encapsulate !== 'function') {
    throw new Error('PQC requires Node.js >=24.8 with native ML-DSA/ML-KEM; no fallback is available');
  }
}

function supported(algorithm, algorithms) {
  assertPqcRuntime();
  if (!algorithms.includes(algorithm)) throw new Error('unsupported algorithm');
}

export function decodeHex(value, name, bytes) {
  if (typeof value !== 'string' || value.length % 2 !== 0 || !/^[0-9a-f]+$/.test(value) ||
      (bytes !== undefined && value.length !== bytes * 2)) {
    throw new TypeError(`${name} must be canonical lowercase hex${bytes === undefined ? '' : ` (${bytes} bytes)`}`);
  }
  return Buffer.from(value, 'hex');
}

function keyObject(key, algorithm, type) {
  // Explicit key objects/PEM only: a kms:// string is not a signing key.
  if (!(key instanceof crypto.KeyObject) && typeof key !== 'string') throw new TypeError(`${type} key is required`);
  if (typeof key === 'string' && !key.startsWith(type === 'private' ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----')) {
    throw new TypeError(`expected ${type === 'private' ? 'PKCS8' : 'SPKI'} PEM key`);
  }
  const object = key instanceof crypto.KeyObject ? key : type === 'private'
    ? crypto.createPrivateKey(key) : crypto.createPublicKey(key);
  if (object.type !== type || object.asymmetricKeyType !== algorithm.toLowerCase()) {
    throw new TypeError(`expected ${algorithm} ${type} key`);
  }
  return object;
}

export function generateSigningKeyPair(algorithm = 'ML-DSA-65') {
  supported(algorithm, SUPPORTED_SIG);
  return crypto.generateKeyPairSync(algorithm.toLowerCase());
}

export function generateKemKeyPair(algorithm = 'ML-KEM-768') {
  supported(algorithm, SUPPORTED_KEM);
  return crypto.generateKeyPairSync(algorithm.toLowerCase());
}

export function exportPublicKey(key) {
  const publicKey = key.type === 'private' ? crypto.createPublicKey(key) : key;
  return publicKey.export({ type: 'spki', format: 'pem' });
}

export function signerTag(publicKey, algorithm = 'ML-DSA-65') {
  supported(algorithm, SUPPORTED_SIG);
  const key = keyObject(publicKey, algorithm, 'public');
  return `aegis_sig1_${crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')}`;
}

export function kemRecipientTag(publicKey, algorithm = 'ML-KEM-768') {
  supported(algorithm, SUPPORTED_KEM);
  const key = keyObject(publicKey, algorithm, 'public');
  return `aegis_kem1_${crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex')}`;
}

function signatureMessage(messageDigest, domainTag) {
  const digest = decodeHex(messageDigest, 'messageDigest', 32);
  if (typeof domainTag !== 'string' || !/^[A-Z0-9_]{1,64}$/.test(domainTag)) throw new TypeError('invalid domainTag');
  const domain = Buffer.from(domainTag, 'ascii');
  // Pure ML-DSA signs a framed protocol message, not HashML-DSA.
  return Buffer.concat([Buffer.from(`${CRYPTO_VERSION}\0`, 'ascii'), Buffer.from([domain.length]), domain, digest]);
}

export function signDigest({ algorithm, privateKey, messageDigest, domainTag }) {
  supported(algorithm, SUPPORTED_SIG);
  const key = keyObject(privateKey, algorithm, 'private');
  return {
    signature: crypto.sign(null, signatureMessage(messageDigest, domainTag), key).toString('hex'),
    signature_algorithm: algorithm,
  };
}

export function verifyDigest({ algorithm, publicKey, messageDigest, signature, domainTag }) {
  // Runtime errors must not silently select another implementation.
  assertPqcRuntime();
  try {
    supported(algorithm, SUPPORTED_SIG);
    const key = keyObject(publicKey, algorithm, 'public');
    const bytes = decodeHex(signature, 'signature', SIGNATURE_BYTES[algorithm]);
    const valid = crypto.verify(null, signatureMessage(messageDigest, domainTag), key, bytes);
    return { valid, reason: valid ? 'verified' : 'invalid signature', signature_algorithm: algorithm };
  } catch {
    return { valid: false, reason: 'invalid signature inputs' };
  }
}

// The raw KEM shared secret is a Buffer owned by the caller. Do not log it;
// derive an application key and clear the Buffer when finished.
export function encapsulate({ algorithm, recipientPublicKey }) {
  supported(algorithm, SUPPORTED_KEM);
  const result = crypto.encapsulate(keyObject(recipientPublicKey, algorithm, 'public'));
  return { ciphertext: result.ciphertext.toString('hex'), shared_secret: result.sharedKey, kem_algorithm: algorithm };
}

export function decapsulate({ algorithm, recipientPrivateKey, ciphertext }) {
  supported(algorithm, SUPPORTED_KEM);
  const bytes = decodeHex(ciphertext, 'KEM ciphertext', CIPHERTEXT_BYTES[algorithm]);
  const secret = crypto.decapsulate(keyObject(recipientPrivateKey, algorithm, 'private'), bytes);
  return { shared_secret: secret, kem_algorithm: algorithm };
}
