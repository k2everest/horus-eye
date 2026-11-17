import crypto from 'node:crypto';
import { buildTranscriptHash, canonicalSerialize } from './canonical-transcript.mjs';
import { createNote } from './note-model.mjs';
import { signDigest, exportPublicKey, signerTag, kemRecipientTag, CRYPTO_VERSION } from './pqc-wrapper.mjs';
import { sealEnvelope } from './sealed-envelope.mjs';

export function buildShieldedTx({
  requestId, senderTag, recipientTag, assetId = 'AEGIS', amount,
  randomness = crypto.randomBytes(32).toString('hex'),
  signatureAlgorithm = 'ML-DSA-65', kemAlgorithm = 'ML-KEM-768',
  privateKey, recipientPublicKey,
}) {
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new Error('invalid requestId');
  if (typeof assetId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(assetId)) throw new Error('invalid assetId');
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('amount must be positive safe integer units');
  if (typeof randomness !== 'string' || !/^[0-9a-f]{64}$/.test(randomness)) throw new Error('randomness must contain 32 bytes of hex');
  // No default demo key or implicit in-memory signer.
  if (!(privateKey instanceof crypto.KeyObject) || privateKey.type !== 'private') throw new Error('privateKey KeyObject is required');
  const publicKey = crypto.createPublicKey(privateKey);
  const sender = signerTag(publicKey, signatureAlgorithm);
  const recipient = kemRecipientTag(recipientPublicKey, kemAlgorithm);
  if (senderTag !== undefined && senderTag !== sender) throw new Error('senderTag does not match signing key');
  if (recipientTag !== undefined && recipientTag !== recipient) throw new Error('recipientTag does not match encryption key');
  const note = createNote({ ownerTag: recipient, value: amount, randomness, assetId });
  const plaintext = Buffer.from(canonicalSerialize(note), 'utf8');
  let encryptedOutput;
  try {
    encryptedOutput = sealEnvelope({
      plaintext, recipientPublicKey, algorithm: kemAlgorithm,
      context: `NOTE_OUTPUT_V1:${requestId}`,
    });
  } finally {
    plaintext.fill(0);
  }
  const payload = {
    crypto_version: CRYPTO_VERSION,
    request_id: requestId, sender_tag: sender, recipient_tag: recipient,
    output_commitment: note.commitment, asset_id: assetId, amount,
    signature_algorithm: signatureAlgorithm,
    pq_public_key: exportPublicKey(publicKey), encrypted_output: encryptedOutput,
  };
  const digest = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload });
  const sig = signDigest({ algorithm: signatureAlgorithm, privateKey, messageDigest: digest, domainTag: 'SIG_TX_V1' });
  // Only public, signed fields leave the builder; no opening/private key/raw note.
  return { ...payload, tx_id: digest, transcript_hash: digest, pq_signature: sig.signature };
}
