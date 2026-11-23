import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTranscriptHash, canonicalSerialize } from './canonical-transcript.mjs';

test('canonicalSerialize deve ordenar chaves e remover undefined', () => {
  const a = canonicalSerialize({ b: 2, a: 1, c: undefined, d: { z: 1, y: 2 } });
  const b = canonicalSerialize({ d: { y: 2, z: 1 }, a: 1, b: 2 });
  assert.equal(a, b);
  assert.equal(a, '{"a":1,"b":2,"d":{"y":2,"z":1}}');
});

test('buildTranscriptHash deve ser determinístico para payload equivalente', () => {
  const payload1 = { request_id: 'r1', tx: { outputs: [2, 1], amount: 10 } };
  const payload2 = { tx: { amount: 10, outputs: [2, 1] }, request_id: 'r1' };

  const h1 = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload: payload1 });
  const h2 = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload: payload2 });

  assert.equal(h1, h2);
});

test('buildTranscriptHash deve variar por domainTag', () => {
  const payload = { request_id: 'r1', tx_id_hash: 'abc' };
  const h1 = buildTranscriptHash({ domainTag: 'SIG_TX_V1', payload });
  const h2 = buildTranscriptHash({ domainTag: 'PROOF_TX_V1', payload });

  assert.notEqual(h1, h2);
});
