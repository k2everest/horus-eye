import test from 'node:test';
import assert from 'node:assert/strict';

import { proveTxV1 } from './prover-v1.mjs';
import { buildTxStatement } from './zk-statement.mjs';
import { verifyTxProofV1 } from './verifier-v1.mjs';

function validStatement() {
  return buildTxStatement({
    anchorStateRoot: 'root-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
    publicAmount: 0,
  });
}

function validWitness() {
  return {
    spend_secret_ref: 'kms://spend-1',
    note_paths: ['path-1'],
    openings: ['open-1'],
  };
}

test('US-010: verifyTxProofV1 aceita prova gerada pelo prover v1', () => {
  const statement = validStatement();
  const proofOut = proveTxV1({ statement, witness: validWitness() });
  const verified = verifyTxProofV1({ statement, proof: proofOut.proof });

  assert.equal(verified.valid, true);
  assert.deepEqual(verified.failed_checks, []);
  assert.equal(verified.statement_digest, proofOut.statement_digest);
  assert.equal(typeof verified.verify_time_ms, 'number');
  assert.ok(verified.proof_size_bytes > 0);
});

test('US-010: rejeita proof base64/json inválida', () => {
  const verified = verifyTxProofV1({ statement: validStatement(), proof: 'not-valid-base64-json' });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('proof inválida')));
});

test('US-010: rejeita statement divergente do digest da proof', () => {
  const statement = validStatement();
  const proofOut = proveTxV1({ statement, witness: validWitness() });
  const differentStatement = buildTxStatement({
    anchorStateRoot: 'root-2',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
  });

  const verified = verifyTxProofV1({ statement: differentStatement, proof: proofOut.proof });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('statement_digest divergente')));
});

test('US-010: rejeita proof sem cláusula obrigatória', () => {
  const statement = validStatement();
  const proofOut = proveTxV1({ statement, witness: validWitness() });
  const payload = JSON.parse(Buffer.from(proofOut.proof, 'base64').toString('utf8'));
  delete payload.range;
  const tamperedProof = Buffer.from(JSON.stringify(payload)).toString('base64');

  const verified = verifyTxProofV1({ statement, proof: tamperedProof });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('range')));
});
