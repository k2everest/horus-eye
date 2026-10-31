import crypto from 'node:crypto';

function hashHex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hashPair(left, right) {
  return hashHex(`${left}|${right}`);
}

export function computeCommitmentRoot(commitments) {
  if (!Array.isArray(commitments)) throw new Error('commitments must be an array');
  if (commitments.length === 0) return hashHex('AEGIS_EMPTY_COMMITMENT_TREE');

  let level = commitments.map((commitment) => hashHex(`leaf|${commitment}`));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(hashPair(level[i], level[i + 1] ?? level[i]));
    }
    level = next;
  }
  return level[0];
}

export class LedgerCommitmentTree {
  constructor() {
    this.commitments = [];
    this.rootsByHeight = new Map();
    this.commitmentsByHeight = new Map();
  }

  commitBlock({ height, newCommitments }) {
    if (!Number.isInteger(height) || height < 0) throw new Error('height must be a non-negative integer');
    if (!Array.isArray(newCommitments) || newCommitments.length === 0) throw new Error('newCommitments is required');
    if (this.rootsByHeight.has(height)) throw new Error(`height ${height} already committed`);

    this.commitments.push(...newCommitments);
    const root = computeCommitmentRoot(this.commitments);

    this.rootsByHeight.set(height, root);
    this.commitmentsByHeight.set(height, [...this.commitments]);

    return {
      height,
      root,
      commitment_count: this.commitments.length,
    };
  }

  getRoot(height) {
    if (!this.rootsByHeight.has(height)) return undefined;
    return this.rootsByHeight.get(height);
  }

  getSnapshot(height) {
    const root = this.getRoot(height);
    if (!root) return undefined;
    return {
      height,
      root,
      commitments: [...this.commitmentsByHeight.get(height)],
    };
  }

  latestRoot() {
    const heights = [...this.rootsByHeight.keys()].sort((a, b) => a - b);
    if (heights.length === 0) return undefined;
    const height = heights.at(-1);
    return { height, root: this.rootsByHeight.get(height) };
  }
}
