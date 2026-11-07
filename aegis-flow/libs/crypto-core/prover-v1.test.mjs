import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTxStatement } from './zk-statement.mjs';
import { proveTxV1 } from './prover-v1.mjs';

test('US-009: proveTxV1 gera prova e métricas', () => {
  const statement = buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
    publicAmount: 0,
  });

  const out = proveTxV1({
    statement,
    witness: {
      spend_secret_ref: 'kms://spend-1',
      note_paths: ['path-1'],
      openings: ['open-1'],
    },
  });

  assert.equal(out.ok, true);
  assert.equal(typeof out.proof, 'string');
  assert.ok(out.proof.length > 0);
  assert.equal(typeof out.prove_time_ms, 'number');
  assert.equal(typeof out.proof_size_bytes, 'number');
  assert.ok(out.proof_size_bytes > 0);
});

test('US-009: falha sem witness válido', () => {
  const statement = buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
  });

  const out = proveTxV1({ statement, witness: {} });
  assert.equal(out.ok, false);
  assert.ok(out.error.includes('witness'));
});

test('US-009: falha com statement inválido', () => {
  const out = proveTxV1({
    statement: { anchor_state_root: 'root-only' },
    witness: { spend_secret_ref: 'kms://spend-1' },
  });

  assert.equal(out.ok, false);
  assert.ok(out.error.includes('invalid statement'));
});
