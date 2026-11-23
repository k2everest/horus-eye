import crypto from 'node:crypto';

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const v = value[key];
        if (v !== undefined) acc[key] = normalizeValue(v);
        return acc;
      }, {});
  }

  return value;
}

export function canonicalSerialize(payload) {
  return JSON.stringify(normalizeValue(payload));
}

export function buildTranscriptHash({ domainTag, payload }) {
  if (!domainTag) throw new Error('domainTag is required');
  const serialized = canonicalSerialize(payload);
  return crypto.createHash('sha256').update(`${domainTag}|${serialized}`).digest('hex');
}
