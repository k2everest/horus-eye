import test from 'node:test';
import assert from 'node:assert/strict';
import { proveTxV1 } from './prover-v1.mjs';

test('never manufactures a successful proof from arbitrary witness references', async () => {
  for (const witness of [undefined, {}, { spend_secret_ref: 'kms://fake', openings: ['fake'], note_paths: ['fake'] }]) {
    const result = await proveTxV1({ statement: { anchor_state_root: 'root' }, witness, backend: null });
    assert.equal(result.ok, false);
    assert.equal(result.proof, undefined);
    assert.equal(result.error, 'ZK_BACKEND_NOT_CONFIGURED');
  }
});
