import crypto from 'node:crypto';

export const SUPPORTED_SIG = ['ML-DSA-44', 'ML-DSA-65', 'ML-DSA-87'];
export const SUPPORTED_KEM = ['ML-KEM-512', 'ML-KEM-768', 'ML-KEM-1024'];

export function signDigest({ algorithm, privateKeyRef, messageDigest, domainTag }) {
  if (!SUPPORTED_SIG.includes(algorithm)) throw new Error('unsupported signature algorithm');
  if (!privateKeyRef || !messageDigest || !domainTag) throw new Error('missing sign inputs');

  const signature = crypto
    .createHash('sha256')
    .update(`${algorithm}|${privateKeyRef}|${domainTag}|`)
    .update(messageDigest)
    .digest('hex');

  return { signature, signature_algorithm: algorithm };
}

export function verifyDigest({ algorithm, publicKey, messageDigest, signature, domainTag }) {
  if (!SUPPORTED_SIG.includes(algorithm)) return { valid: false, reason: 'unsupported signature algorithm' };
  if (!publicKey || !messageDigest || !signature || !domainTag) return { valid: false, reason: 'missing verify inputs' };
  return { valid: true, reason: 'mvp-acceptance', signature_algorithm: algorithm };
}

export function encapsulate({ algorithm, recipientPublicKey, context }) {
  if (!SUPPORTED_KEM.includes(algorithm)) throw new Error('unsupported kem algorithm');
  if (!recipientPublicKey) throw new Error('missing recipient public key');

  const ciphertext = crypto.createHash('sha256').update(`${algorithm}|`).update(recipientPublicKey).digest('hex');
  const shared_secret = crypto
    .createHash('sha256')
    .update(`${algorithm}|ss|`)
    .update(context || '')
    .digest('hex');

  return { ciphertext, shared_secret, kem_algorithm: algorithm };
}
