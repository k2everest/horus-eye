import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStatementDigest,
  buildTxStatement,
  createZkStatementEnvelope,
  validateTxStatementShape,
} from './zk-statement.mjs';

test('US-008: buildTxStatement deve montar statement válido', () => {
  const st = buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
    publicAmount: 0,
  });

  const shape = validateTxStatementShape(st);
  assert.equal(shape.valid, true);
  assert.equal(shape.errors.length, 0);
});

test('US-008: statement digest deve ser determinístico', () => {
  const st = buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1', 'in-2'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
    publicAmount: 5,
  });

  const d1 = buildStatementDigest(st);
  const d2 = buildStatementDigest(st);
  assert.equal(d1, d2);
});

test('US-008: createZkStatementEnvelope inclui cláusulas formais', () => {
  const st = buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
  });

  const env = createZkStatementEnvelope({ statement: st });
  assert.equal(env.constraints_version, 'ZK-STMT-V1');
  assert.equal(env.clauses.ownership, true);
  assert.equal(env.clauses.balance, true);
  assert.equal(env.clauses.range, true);
  assert.equal(env.clauses.nullifier_uniqueness, true);
  assert.equal(typeof env.statement_digest, 'string');
  assert.equal(env.statement_digest.length, 64);
});
