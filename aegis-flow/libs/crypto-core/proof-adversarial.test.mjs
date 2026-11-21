import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTxProofV1 } from './verifier-v1.mjs';
import { buildTxStatement, buildStatementDigest } from './zk-statement.mjs';

test('rejects the historical forgery with all boolean clauses and matching public digest', async () => {
  const statement = buildTxStatement({
    anchorStateRoot: 'root', inputCommitments: ['input'], outputCommitments: ['output'], nullifiers: ['nullifier'],
  });
  const forged = {
    scheme: 'LATTICE-ZK-MVP', statement_digest: buildStatementDigest(statement),
    proving_key_id: 'pk-aegis-v1', ownership: true, balance: true,
    range: true, nullifier_uniqueness: true, witness_commitment: 'not-a-proof',
  };
  const seenProofDigests = new Set();
  const result = await verifyTxProofV1({ statement, proof: Buffer.from(JSON.stringify(forged)).toString('base64'), seenProofDigests });
  assert.equal(result.valid, false);
  assert.equal(seenProofDigests.size, 0);
});
