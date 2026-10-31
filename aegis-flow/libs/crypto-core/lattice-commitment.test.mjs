import test from 'node:test';
import assert from 'node:assert/strict';

import { commit, verify } from './lattice-commitment.mjs';

test('commit/open/verify válido', () => {
  const out = commit({ value: 42, randomness: 'rand-1' });
  assert.equal(typeof out.commitment, 'string');
  assert.equal(out.commitment.length, 64);
  assert.equal(verify({ commitment: out.commitment, opening: out.opening }), true);
});

test('verify deve falhar com opening alterado', () => {
  const out = commit({ value: 42, randomness: 'rand-1' });
  const tampered = { ...out.opening, randomness: 'rand-2' };
  assert.equal(verify({ commitment: out.commitment, opening: tampered }), false);
});

test('commitments diferentes para randomess diferente (hiding MVP)', () => {
  const c1 = commit({ value: 42, randomness: 'rand-1' }).commitment;
  const c2 = commit({ value: 42, randomness: 'rand-2' }).commitment;
  assert.notEqual(c1, c2);
});
