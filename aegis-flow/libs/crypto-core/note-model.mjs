import crypto from 'node:crypto';
import { commit } from './lattice-commitment.mjs';

function h(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function createNote({ ownerTag, value, randomness, assetId = 'AEGIS' }) {
  if (!ownerTag) throw new Error('ownerTag is required');
  if (value === undefined || value === null) throw new Error('value is required');
  if (!randomness) throw new Error('randomness is required');

  const commitmentOut = commit({
    value: `${assetId}:${value}:${ownerTag}`,
    randomness,
    scheme: 'SIS-LWE-MVP',
  });

  const noteId = h(`${ownerTag}|${assetId}|${value}|${randomness}`);

  return {
    note_id: noteId,
    asset_id: assetId,
    owner_tag: ownerTag,
    value,
    commitment: commitmentOut.commitment,
    opening: commitmentOut.opening,
  };
}

export function deriveNullifier({ noteId, spendSecret, position = 0 }) {
  if (!noteId) throw new Error('noteId is required');
  if (!spendSecret) throw new Error('spendSecret is required');
  return h(`${noteId}|${spendSecret}|${position}`);
}

export function canonicalizeNote(note) {
  return {
    note_id: note.note_id,
    asset_id: note.asset_id,
    owner_tag: note.owner_tag,
    value: note.value,
    commitment: note.commitment,
  };
}
