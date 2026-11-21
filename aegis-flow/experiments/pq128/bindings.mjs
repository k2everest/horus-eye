// Experimental building blocks only: no STARK, no financial circuit, no node
// acceptance, and no claim of demonstrated end-to-end PQ128 security.
// Existing V1/V2 hash/signature formats are not changed or reused. Only runtime
// and hex validation helpers are shared. Larger hashes and ML-DSA-87 do not
// prove a composite protocol secure.
import crypto from 'node:crypto';
import { assertPqcRuntime, decodeHex } from '../../libs/crypto-core/pqc-wrapper.mjs';

export const BINDING_SUITE = 'AEGIS-EXPERIMENT-SHA512-MLDSA87-V1';
export const SIGNATURE_ALGORITHM = 'ML-DSA-87';
const PREFIX = Buffer.from('AEGIS_BINDING_FRAME_V1\0', 'ascii');
const MAX_PARTS = 64, MAX_PART_BYTES = 1024 * 1024, MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const domainBytes = domain => {
  if (typeof domain !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(domain)) throw new TypeError('invalid binding domain');
  return Buffer.from(domain, 'ascii');
};
const bytes = value => {
  if (!(value instanceof Uint8Array) || value.length > MAX_PART_BYTES) throw new TypeError('bounded byte array required');
  return Buffer.from(value);
};
const u32 = value => { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; };
const framed = value => Buffer.concat([u32(value.length), value]);

// Binary frame: prefix || len32(suite) || suite || len32(domain) || domain ||
// count32(parts) || (len32(part) || part)*. Lengths/counts are big endian.
export function bindingFrame512({domain, parts}) {
  const tag = domainBytes(domain);
  if (!Array.isArray(parts) || parts.length > MAX_PARTS) throw new TypeError('bounded parts array required');
  let total = 0;
  for (const part of parts) {
    if (!(part instanceof Uint8Array) || part.length > MAX_PART_BYTES) throw new TypeError('bounded byte array required');
    total += part.length;
    if (total > MAX_TOTAL_BYTES) throw new TypeError('binding too large');
  }
  const material = parts.map(bytes);
  return Buffer.concat([PREFIX, framed(Buffer.from(BINDING_SUITE, 'ascii')), framed(tag), u32(material.length), ...material.map(framed)]);
}
export function bindingDigest512(input) {
  return crypto.createHash('sha512').update(bindingFrame512(input)).digest('hex');
}

// Generic commitment to bytes, not a monetary note. Its hiding/binding analysis
// and any application relation remain external obligations.
export function commitment512({domain, value, randomness}) {
  const blind = decodeHex(randomness, 'commitment randomness', 64);
  return bindingDigest512({domain:'COMMITMENT',parts:[domainBytes(domain), bytes(value), blind]});
}
export function merkleLeaf512(value) {
  return bindingDigest512({domain:'MERKLE_LEAF',parts:[bytes(value)]});
}
export function merkleNode512(left, right) {
  return bindingDigest512({domain:'MERKLE_NODE',parts:[decodeHex(left,'left digest',64),decodeHex(right,'right digest',64)]});
}
export function transcriptDigest512({domain, payload}) {
  return bindingDigest512({domain:'TRANSCRIPT',parts:[domainBytes(domain),bytes(payload)]});
}

function keyObject(key, type) {
  assertPqcRuntime();
  if (!(key instanceof crypto.KeyObject) && typeof key !== 'string') throw new TypeError(`${type} key required`);
  if (typeof key === 'string' && !key.startsWith(type === 'private' ? '-----BEGIN PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----')) throw new TypeError('canonical PEM required');
  const object = key instanceof crypto.KeyObject ? key : type === 'private' ? crypto.createPrivateKey(key) : crypto.createPublicKey(key);
  if (object.type !== type || object.asymmetricKeyType !== 'ml-dsa-87') throw new TypeError('ML-DSA-87 key required');
  return object;
}
export function signerTag512(publicKey) {
  const key = keyObject(publicKey,'public');
  return bindingDigest512({domain:'SIGNER_TAG',parts:[key.export({type:'spki',format:'der'})]});
}
function signatureFrame(domain, digest, signer) {
  return bindingFrame512({domain:'SIGNED_TRANSCRIPT',parts:[domainBytes(domain),decodeHex(digest,'transcript digest',64),decodeHex(signer,'signer tag',64)]});
}
export function signTranscript512({domain, payload, privateKey, algorithm = SIGNATURE_ALGORITHM, suite = BINDING_SUITE}) {
  if (algorithm !== SIGNATURE_ALGORITHM || suite !== BINDING_SUITE) throw new TypeError('unapproved experimental suite');
  const key = keyObject(privateKey,'private');
  const digest = transcriptDigest512({domain,payload});
  const signer = signerTag512(crypto.createPublicKey(key));
  return {suite:BINDING_SUITE,signature_algorithm:SIGNATURE_ALGORITHM,domain,transcript_digest:digest,signer_tag:signer,
    signature:crypto.sign(null,signatureFrame(domain,digest,signer),key).toString('hex')};
}

// The expected public key is supplied independently by the caller: an attacker
// cannot replace an embedded public key and thereby authenticate a new identity.
export function verifyTranscript512({domain, payload, publicKey, signed}) {
  assertPqcRuntime();
  try {
    if (!signed || typeof signed !== 'object' || Array.isArray(signed) ||
      Object.keys(signed).sort().join(',') !== 'domain,signature,signature_algorithm,signer_tag,suite,transcript_digest' ||
      signed.suite !== BINDING_SUITE || signed.signature_algorithm !== SIGNATURE_ALGORITHM || signed.domain !== domain) return false;
    const key = keyObject(publicKey,'public');
    const digest = transcriptDigest512({domain,payload});
    const signer = signerTag512(key);
    if (signed.transcript_digest !== digest || signed.signer_tag !== signer) return false;
    const signature = decodeHex(signed.signature,'signature',4627);
    return crypto.verify(null,signatureFrame(domain,digest,signer),key,signature);
  } catch { return false; }
}
