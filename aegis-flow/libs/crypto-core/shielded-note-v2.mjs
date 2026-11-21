import crypto from 'node:crypto';
import { decodeHex } from './pqc-wrapper.mjs';

const hash = (domain, ...pieces) => {
  const h = crypto.createHash('sha256').update(`${domain}\0`, 'ascii');
  for (const piece of pieces) h.update(piece);
  return h.digest('hex');
};
export function spendOwner(spendSecret) {
  return hash('AEGIS_OWNER_V2', decodeHex(spendSecret, 'spend secret', 32));
}
export function createSpendIdentity() {
  const spend_secret = crypto.randomBytes(32).toString('hex');
  return { spend_secret, owner_tag: spendOwner(spend_secret) };
}
export function assertNoteV2(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note) || Object.keys(note).sort().join(',') !== 'asset_id,owner_tag,randomness,value') throw new TypeError('invalid note schema');
  if (typeof note.asset_id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(note.asset_id)) throw new TypeError('invalid asset');
  if (!Number.isSafeInteger(note.value) || note.value <= 0) throw new TypeError('invalid note value');
  decodeHex(note.owner_tag, 'owner tag', 32);
  decodeHex(note.randomness, 'note randomness', 32);
}
export function createPrivateNote({ ownerTag, value, assetId = 'AEGIS', randomness = crypto.randomBytes(32).toString('hex') }) {
  const note = { asset_id: assetId, value, owner_tag: ownerTag, randomness };
  assertNoteV2(note);
  return note;
}
export function noteCommitmentV2(note) {
  assertNoteV2(note);
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(note.value));
  return hash('AEGIS_NOTE_V2', Buffer.from([note.asset_id.length]), Buffer.from(note.asset_id, 'ascii'), value,
    decodeHex(note.owner_tag, 'owner tag', 32), decodeHex(note.randomness, 'note randomness', 32));
}
export function noteNullifierV2(note, spendSecret) {
  assertNoteV2(note);
  if (spendOwner(spendSecret) !== note.owner_tag) throw new Error('SPEND_SECRET_DOES_NOT_OWN_NOTE');
  return hash('AEGIS_NULLIFIER_V2', Buffer.from(noteCommitmentV2(note), 'hex'), decodeHex(spendSecret, 'spend secret', 32));
}
