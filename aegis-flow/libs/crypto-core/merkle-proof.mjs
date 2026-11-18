import crypto from 'node:crypto';

const VERSION = 'AEGIS-MERKLE-V1';
const hex = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const hash = (...parts) => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const leafHash = value => hash(`${VERSION}:leaf`, value);
const pairHash = (left, right) => hash(`${VERSION}:node`, left, right);
const rootHash = (count, root) => hash(`${VERSION}:root`, count, root);

function leaves(commitments) {
  if (!Array.isArray(commitments) || commitments.length > 1_000_000 ||
      commitments.some(item => typeof item !== 'string' || !item || item.length > 128)) {
    throw new TypeError('invalid commitments');
  }
  return commitments.map(leafHash);
}

export function merkleRoot(commitments) {
  let level = leaves(commitments);
  if (!level.length) return rootHash(0, null);
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(pairHash(level[i], level[i + 1] ?? level[i]));
    level = next;
  }
  // Bind the count: [a,b,c] and [a,b,c,c] must have different roots.
  return rootHash(commitments.length, level[0]);
}

export function createInclusionProof(commitments, index) {
  let level = leaves(commitments);
  if (!Number.isSafeInteger(index) || index < 0 || index >= level.length) throw new RangeError('invalid leaf index');
  const siblings = [];
  let position = index;
  while (level.length > 1) {
    siblings.push(level[position ^ 1] ?? level[position]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(pairHash(level[i], level[i + 1] ?? level[i]));
    position = Math.floor(position / 2);
    level = next;
  }
  return { version: VERSION, commitment: commitments[index], index, leaf_count: commitments.length, siblings };
}

export function verifyInclusionProof({ proof, trustedRoot }) {
  try {
    if (!hex(trustedRoot) || !proof || Object.keys(proof).length !== 5 || proof.version !== VERSION ||
        typeof proof.commitment !== 'string' || !proof.commitment || proof.commitment.length > 128 ||
        !Number.isSafeInteger(proof.index) || !Number.isSafeInteger(proof.leaf_count) ||
        proof.leaf_count < 1 || proof.leaf_count > 1_000_000 || proof.index < 0 || proof.index >= proof.leaf_count ||
        !Array.isArray(proof.siblings) || proof.siblings.length !== Math.ceil(Math.log2(proof.leaf_count)) ||
        proof.siblings.some(sibling => !hex(sibling))) return false;
    let value = leafHash(proof.commitment);
    let position = proof.index;
    let width = proof.leaf_count;
    for (const sibling of proof.siblings) {
      if (position % 2 === 0 && position + 1 >= width && sibling !== value) return false;
      value = position % 2 === 0 ? pairHash(value, sibling) : pairHash(sibling, value);
      position = Math.floor(position / 2);
      width = Math.ceil(width / 2);
    }
    return rootHash(proof.leaf_count, value) === trustedRoot;
  } catch {
    return false;
  }
}
