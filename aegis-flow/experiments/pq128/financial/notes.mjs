// Experimental note bindings only. No proof of ownership/balance/inclusion is
// produced here, no minting rules are defined, and no node accepts this format.
// These helpers must not be confused with an end-to-end PQ128 demonstration.
import crypto from 'node:crypto';
import { bindingDigest512 } from '../bindings.mjs';
import { decodeHex } from '../../../libs/crypto-core/pqc-wrapper.mjs';

export const NOTE512_VERSION = 'AEGIS_EXPERIMENT_NOTE512_V1';
export const NOTE512_ASSET = 'QUEER';
export const MAX_NOTE512_VALUE = '9007199254740991';
const VERSION = Buffer.from(NOTE512_VERSION,'ascii'), ASSET = Buffer.from(NOTE512_ASSET,'ascii');
const networkBytes = networkId => {
  if (typeof networkId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(networkId)) throw new TypeError('invalid experimental note network');
  return Buffer.from(networkId,'ascii');
};
const assertValue = value => {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value) || BigInt(value) > BigInt(MAX_NOTE512_VALUE)) throw new TypeError('canonical positive integer value string required');
};

export function ownerTag512({networkId,spendSecret}) {
  return bindingDigest512({domain:'NOTE512_OWNER',parts:[VERSION,networkBytes(networkId),ASSET,decodeHex(spendSecret,'spend secret',64)]});
}
export function createSpendIdentity512({networkId}) {
  networkBytes(networkId);
  const spend_secret = crypto.randomBytes(64).toString('hex');
  return {spend_secret,owner_tag:ownerTag512({networkId,spendSecret:spend_secret})};
}
export function assertNote512(note) {
  if (!note || typeof note !== 'object' || Array.isArray(note) ||
    Object.keys(note).sort().join(',') !== 'asset_id,network_id,owner_tag,randomness,value,version' ||
    note.version !== NOTE512_VERSION || note.asset_id !== NOTE512_ASSET) throw new TypeError('invalid experimental note schema');
  networkBytes(note.network_id); assertValue(note.value);
  decodeHex(note.owner_tag,'owner tag',64); decodeHex(note.randomness,'note randomness',64);
  return note;
}
export function createNote512({networkId,ownerTag,value,randomness = crypto.randomBytes(64).toString('hex')}) {
  const note = {version:NOTE512_VERSION,network_id:networkId,asset_id:NOTE512_ASSET,value,owner_tag:ownerTag,randomness};
  return assertNote512(note);
}
export function noteCommitment512(note) {
  assertNote512(note);
  return bindingDigest512({domain:'NOTE512_COMMITMENT',parts:[VERSION,networkBytes(note.network_id),ASSET,Buffer.from(note.value,'ascii'),
    decodeHex(note.owner_tag,'owner tag',64),decodeHex(note.randomness,'note randomness',64)]});
}
export function nullifier512({note,spendSecret}) {
  assertNote512(note);
  if (ownerTag512({networkId:note.network_id,spendSecret}) !== note.owner_tag) throw new Error('SPEND_SECRET_DOES_NOT_OWN_NOTE');
  // Stable across locations/reorgs: no transaction ID, anchor or position enters
  // the nullifier. It binds the complete note commitment, secret and network.
  return bindingDigest512({domain:'NOTE512_NULLIFIER',parts:[VERSION,networkBytes(note.network_id),ASSET,
    decodeHex(noteCommitment512(note),'note commitment',64),decodeHex(spendSecret,'spend secret',64)]});
}
