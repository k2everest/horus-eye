import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalizeNote, createNote, deriveNullifier } from './note-model.mjs';

test('createNote deve gerar commitment e note_id', () => {
  const note = createNote({ ownerTag: 'user-1', value: 10, randomness: 'r1' });
  assert.equal(typeof note.note_id, 'string');
  assert.equal(note.note_id.length, 64);
  assert.equal(typeof note.commitment, 'string');
  assert.equal(note.commitment.length, 64);
});

test('deriveNullifier deve ser determinístico', () => {
  const n1 = deriveNullifier({ noteId: 'abc', spendSecret: 's1', position: 2 });
  const n2 = deriveNullifier({ noteId: 'abc', spendSecret: 's1', position: 2 });
  assert.equal(n1, n2);
});

test('deriveNullifier deve variar com segredo/posição', () => {
  const n1 = deriveNullifier({ noteId: 'abc', spendSecret: 's1', position: 2 });
  const n2 = deriveNullifier({ noteId: 'abc', spendSecret: 's2', position: 2 });
  const n3 = deriveNullifier({ noteId: 'abc', spendSecret: 's1', position: 3 });
  assert.notEqual(n1, n2);
  assert.notEqual(n1, n3);
});

test('canonicalizeNote deve remover opening', () => {
  const note = createNote({ ownerTag: 'user-1', value: 10, randomness: 'r1' });
  const canonical = canonicalizeNote(note);
  assert.equal(Object.prototype.hasOwnProperty.call(canonical, 'opening'), false);
  assert.equal(canonical.note_id, note.note_id);
});
