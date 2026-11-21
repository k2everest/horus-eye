import test from 'node:test';
import assert from 'node:assert/strict';

import { NullifierRegistry } from './nullifier-registry.mjs';

test('US-013: reserva e confirma nullifiers de forma atômica', () => {
  const registry = new NullifierRegistry();
  const reserved = registry.reserve({ nullifiers: ['nf-1', 'nf-2'], ownerId: 'tx-1' });
  const committed = registry.commit({ nullifiers: ['nf-1', 'nf-2'], ownerId: 'tx-1' });

  assert.deepEqual(reserved, { reserved: true, conflicts: [] });
  assert.deepEqual(committed, { committed: true, conflicts: [] });
  assert.equal(registry.check('nf-1').status, 'committed');
  assert.equal(registry.check('nf-1').already_used, true);
});

test('US-013: rejeita reserva concorrente do mesmo nullifier', () => {
  const registry = new NullifierRegistry();
  const first = registry.reserve({ nullifiers: ['nf-race'], ownerId: 'tx-1' });
  const second = registry.reserve({ nullifiers: ['nf-race'], ownerId: 'tx-2' });

  assert.equal(first.reserved, true);
  assert.deepEqual(second, { reserved: false, conflicts: ['nf-race'] });
  assert.equal(registry.check('nf-race').owner_id, 'tx-1');
});

test('US-013: reserva em lote falha sem mutação parcial', () => {
  const registry = new NullifierRegistry();
  registry.reserve({ nullifiers: ['nf-taken'], ownerId: 'tx-1' });

  const attempted = registry.reserve({ nullifiers: ['nf-free', 'nf-taken'], ownerId: 'tx-2' });

  assert.deepEqual(attempted, { reserved: false, conflicts: ['nf-taken'] });
  assert.equal(registry.check('nf-free').already_used, false);
  assert.equal(registry.check('nf-taken').owner_id, 'tx-1');
});

test('US-013: só o owner consegue confirmar ou liberar reserva', () => {
  const registry = new NullifierRegistry();
  registry.reserve({ nullifiers: ['nf-owner'], ownerId: 'tx-1' });

  assert.deepEqual(registry.commit({ nullifiers: ['nf-owner'], ownerId: 'tx-2' }), {
    committed: false,
    conflicts: ['nf-owner'],
  });
  assert.deepEqual(registry.release({ nullifiers: ['nf-owner'], ownerId: 'tx-2' }), {
    released: false,
    conflicts: ['nf-owner'],
  });
  assert.deepEqual(registry.release({ nullifiers: ['nf-owner'], ownerId: 'tx-1' }), {
    released: true,
    conflicts: [],
  });
  assert.equal(registry.check('nf-owner').already_used, false);
});
