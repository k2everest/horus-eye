const STATUS_RESERVED = 'reserved';
const STATUS_COMMITTED = 'committed';

function normalizeNullifiers(nullifiers) {
  if (!Array.isArray(nullifiers) || nullifiers.length === 0) {
    throw new Error('nullifiers is required');
  }
  if (nullifiers.some((nullifier) => !nullifier || typeof nullifier !== 'string')) {
    throw new Error('nullifiers must contain non-empty strings');
  }
  if (new Set(nullifiers).size !== nullifiers.length) {
    throw new Error('nullifiers must be unique within a request');
  }
  return nullifiers;
}

export class NullifierRegistry {
  constructor() {
    this.entries = new Map();
  }

  check(nullifier) {
    const entry = this.entries.get(nullifier);
    return {
      nullifier,
      already_used: Boolean(entry),
      status: entry?.status,
      owner_id: entry?.owner_id,
    };
  }

  reserve({ nullifiers, ownerId }) {
    const normalized = normalizeNullifiers(nullifiers);
    if (!ownerId) throw new Error('ownerId is required');

    const conflicts = normalized.filter((nullifier) => this.entries.has(nullifier));
    if (conflicts.length > 0) {
      return { reserved: false, conflicts };
    }

    // Check completes before mutation, making a batch reservation all-or-nothing.
    for (const nullifier of normalized) {
      this.entries.set(nullifier, { status: STATUS_RESERVED, owner_id: ownerId });
    }

    return { reserved: true, conflicts: [] };
  }

  commit({ nullifiers, ownerId }) {
    const normalized = normalizeNullifiers(nullifiers);
    if (!ownerId) throw new Error('ownerId is required');

    const conflicts = normalized.filter((nullifier) => {
      const entry = this.entries.get(nullifier);
      return !entry || entry.status !== STATUS_RESERVED || entry.owner_id !== ownerId;
    });
    if (conflicts.length > 0) {
      return { committed: false, conflicts };
    }

    for (const nullifier of normalized) {
      this.entries.set(nullifier, { status: STATUS_COMMITTED, owner_id: ownerId });
    }

    return { committed: true, conflicts: [] };
  }

  release({ nullifiers, ownerId }) {
    const normalized = normalizeNullifiers(nullifiers);
    if (!ownerId) throw new Error('ownerId is required');

    const conflicts = normalized.filter((nullifier) => {
      const entry = this.entries.get(nullifier);
      return !entry || entry.status !== STATUS_RESERVED || entry.owner_id !== ownerId;
    });
    if (conflicts.length > 0) {
      return { released: false, conflicts };
    }

    for (const nullifier of normalized) {
      this.entries.delete(nullifier);
    }

    return { released: true, conflicts: [] };
  }
}
