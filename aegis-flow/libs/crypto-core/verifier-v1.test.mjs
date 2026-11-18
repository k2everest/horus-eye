import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTxProofV1 } from './verifier-v1.mjs';

test('absence of ZK backend cannot be bypassed with proof, version or key-id flags', async () => {
  for (const proof of [undefined, 'not-base64', Buffer.from(JSON.stringify({ scheme: 'STARK', valid: true })).toString('base64')]) {
    const result = await verifyTxProofV1({ proof, verifyingKeyId: 'trusted', production_ready: true, backend: null });
    assert.equal(result.valid, false);
    assert.equal(result.status_code, 'UNAVAILABLE');
    assert.equal(result.proof_status, 'BACKEND_NOT_CONFIGURED');
  }
});
