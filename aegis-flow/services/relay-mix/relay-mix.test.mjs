import test from 'node:test';
import assert from 'node:assert/strict';
import { padEnvelope, unpadEnvelope, RelayMix } from './index.mjs';

test('padding preserves binary payloads with fixed frame sizes and fresh randomness', () => {
  for (const length of [1, 32, 60]) {
    const payload = Buffer.alloc(length, 255);
    const frame = padEnvelope(payload, 64);
    assert.equal(frame.length, 64);
    assert.deepEqual(unpadEnvelope(frame), payload);
  }
  assert.notDeepEqual(padEnvelope(Buffer.from('secret'), 64), padEnvelope(Buffer.from('secret'), 64));
});

test('rejects malformed framing and oversized payloads', () => {
  for (const payload of [null, '', Buffer.alloc(0), Buffer.alloc(61)]) {
    assert.throws(() => padEnvelope(payload, 64));
  }
  for (const frame of [null, Buffer.alloc(3), Buffer.alloc(64), Buffer.from([0, 0, 0, 10, 1])]) {
    assert.throws(() => unpadEnvelope(frame));
  }
});

test('only releases full batches without loss, duplication or caller mutation', () => {
  const relay = new RelayMix({ frameBytes: 64, batchSize: 3, maxQueueSize: 4 });
  const original = Buffer.from('one');
  relay.enqueue(original);
  original.fill(0);
  relay.enqueue(Buffer.from('two'));
  assert.deepEqual(relay.takeBatch(), []);
  assert.equal(relay.pending, 2);
  relay.enqueue(Buffer.from('three'));
  relay.enqueue(Buffer.from('four'));
  const batch = relay.takeBatch();
  assert.deepEqual(batch.map(frame => unpadEnvelope(frame).toString()).sort(), ['one', 'three', 'two']);
  assert.ok(batch.every(frame => frame.length === 64));
  assert.equal(relay.pending, 1);
  assert.deepEqual(relay.takeBatch(), []);
});

test('backpressure and validation never mutate queued messages', () => {
  const relay = new RelayMix({ frameBytes: 64, batchSize: 1, maxQueueSize: 1 });
  assert.throws(() => relay.enqueue(Buffer.alloc(61)));
  assert.equal(relay.pending, 0);
  relay.enqueue(Buffer.from('retained'));
  assert.throws(() => relay.enqueue(Buffer.from('overflow')), /full/);
  assert.equal(unpadEnvelope(relay.takeBatch()[0]).toString(), 'retained');
});

test('rejects invalid configuration and excessive memory budgets', () => {
  for (const options of [
    { frameBytes: 4 }, { frameBytes: NaN }, { batchSize: 0 },
    { batchSize: 2, maxQueueSize: 1 }, { maxQueueSize: 1.5 },
    { frameBytes: 1024 * 1024, maxQueueSize: 65 },
  ]) assert.throws(() => new RelayMix(options));
});
