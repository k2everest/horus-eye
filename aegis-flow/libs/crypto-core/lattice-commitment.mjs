import crypto from 'node:crypto';

function hashHex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function commit({ value, randomness, scheme = 'SIS-LWE-MVP' }) {
  if (value === undefined || value === null) throw new Error('value is required');
  if (!randomness) throw new Error('randomness is required');

  const encoded = JSON.stringify({ v: value, r: randomness, s: scheme });
  const commitment = hashHex(encoded);

  return {
    commitment,
    opening: {
      value,
      randomness,
      scheme,
    },
  };
}

export function open({ opening }) {
  if (!opening) throw new Error('opening is required');
  return commit(opening).commitment;
}

export function verify({ commitment, opening }) {
  if (!commitment || !opening) return false;
  return open({ opening }) === commitment;
}
