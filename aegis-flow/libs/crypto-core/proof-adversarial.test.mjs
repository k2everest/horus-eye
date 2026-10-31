import test from 'node:test';
import assert from 'node:assert/strict';

import { proveTxV1 } from './prover-v1.mjs';
import { buildTxStatement } from './zk-statement.mjs';
import { verifyTxProofV1 } from './verifier-v1.mjs';

function fixture() {
  const statement = buildTxStatement({
    anchorStateRoot: 'root-adversarial-1',
    inputCommitments: ['in-1'],
    outputCommitments: ['out-1'],
    nullifiers: ['nf-1'],
  });
  const witness = {
    spend_secret_ref: 'kms://spend-adversarial-1',
    note_paths: ['path-1'],
    openings: ['open-1'],
  };
  return { statement, proof: proveTxV1({ statement, witness }).proof };
}

function tamperProof(proof, mutate) {
  const payload = JSON.parse(Buffer.from(proof, 'base64').toString('utf8'));
  mutate(payload);
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

test('US-011: rejeita proof com scheme adulterado', () => {
  const { statement, proof } = fixture();
  const tampered = tamperProof(proof, (payload) => {
    payload.scheme = 'LEGACY-ZK';
  });

  const verified = verifyTxProofV1({ statement, proof: tampered });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('scheme')));
});

test('US-011: rejeita proof com digest adulterado', () => {
  const { statement, proof } = fixture();
  const tampered = tamperProof(proof, (payload) => {
    payload.statement_digest = '0'.repeat(64);
  });

  const verified = verifyTxProofV1({ statement, proof: tampered });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('statement_digest')));
});

test('US-011: rejeita proof malformada', () => {
  const { statement } = fixture();
  const verified = verifyTxProofV1({ statement, proof: '%%%not-json%%%' });

  assert.equal(verified.valid, false);
  assert.ok(verified.failed_checks.some((x) => x.includes('proof inválida')));
});

test('US-011: rejeita replay da mesma proof quando cache é fornecido', () => {
  const { statement, proof } = fixture();
  const seenProofDigests = new Set();

  const first = verifyTxProofV1({ statement, proof, seenProofDigests });
  const second = verifyTxProofV1({ statement, proof, seenProofDigests });

  assert.equal(first.valid, true);
  assert.equal(second.valid, false);
  assert.ok(second.failed_checks.some((x) => x.includes('replay')));
});
