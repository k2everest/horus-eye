import { randomFillSync, randomInt } from 'node:crypto';

const HEADER_BYTES = 4;

function positiveInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${name} must be an integer between 1 and ${maximum}`);
  }
}

// Fixed-size framing for a future encrypted transport. This frame is NOT encryption.
export function padEnvelope(payload, frameBytes = 4096) {
  positiveInteger(frameBytes, 'frameBytes', 1024 * 1024);
  if (!(payload instanceof Uint8Array) || payload.byteLength === 0) {
    throw new TypeError('payload must be a non-empty Uint8Array');
  }
  if (payload.byteLength > frameBytes - HEADER_BYTES) {
    throw new RangeError('payload exceeds frame capacity');
  }
  const frame = randomFillSync(Buffer.alloc(frameBytes));
  frame.writeUInt32BE(payload.byteLength, 0);
  frame.set(payload, HEADER_BYTES);
  return frame;
}

export function unpadEnvelope(frame) {
  if (!(frame instanceof Uint8Array) || frame.byteLength < HEADER_BYTES) {
    throw new TypeError('invalid frame');
  }
  const bytes = Buffer.from(frame);
  const length = bytes.readUInt32BE(0);
  if (length === 0 || length > bytes.length - HEADER_BYTES) {
    throw new RangeError('invalid payload length');
  }
  return Buffer.from(bytes.subarray(HEADER_BYTES, HEADER_BYTES + length));
}

/** In-memory bounded queue. Caller owns scheduling, encrypted delivery and retries. */
export class RelayMix {
  #queue = [];
  #frameBytes;
  #batchSize;
  #maxQueueSize;

  constructor({ frameBytes = 4096, batchSize = 16, maxQueueSize = 1024 } = {}) {
    positiveInteger(frameBytes, 'frameBytes', 1024 * 1024);
    if (frameBytes <= HEADER_BYTES) throw new RangeError('frameBytes must exceed header size');
    positiveInteger(batchSize, 'batchSize', 65536);
    positiveInteger(maxQueueSize, 'maxQueueSize', 65536);
    if (batchSize > maxQueueSize) throw new RangeError('batchSize exceeds queue capacity');
    if (frameBytes * maxQueueSize > 64 * 1024 * 1024) {
      throw new RangeError('queue memory budget exceeds 64 MiB');
    }
    this.#frameBytes = frameBytes;
    this.#batchSize = batchSize;
    this.#maxQueueSize = maxQueueSize;
  }

  get pending() { return this.#queue.length; }

  enqueue(payload) {
    if (this.pending >= this.#maxQueueSize) throw new Error('relay queue is full');
    this.#queue.push(padEnvelope(payload, this.#frameBytes));
  }

  // Never release a partial batch: a scheduler must wait for sufficient traffic.
  takeBatch() {
    if (this.pending < this.#batchSize) return [];
    const batch = this.#queue.splice(0, this.#batchSize);
    for (let i = batch.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [batch[i], batch[j]] = [batch[j], batch[i]];
    }
    return batch;
  }
}
