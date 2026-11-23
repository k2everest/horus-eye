import { decodeHex } from './pqc-wrapper.mjs';
import { buildTranscriptHash } from './canonical-transcript.mjs';

export const STATEMENT_VERSION = 'AEGIS-ZK-STARK-V1';
const FIELDS = ['version', 'network_id', 'anchor_state_root', 'input_commitments', 'output_commitments', 'nullifiers', 'public_amount', 'public_asset_id', 'transaction_binding'];
export function assertStarkStatement(statement) {
  if (!statement || typeof statement !== 'object' || Array.isArray(statement) || Object.keys(statement).length !== FIELDS.length || FIELDS.some(field => !Object.hasOwn(statement, field))) throw new TypeError('invalid STARK statement schema');
  if (statement.version !== STATEMENT_VERSION) throw new TypeError('invalid STARK version');
  for (const name of ['network_id', 'public_asset_id']) {
    if (typeof statement[name] !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(statement[name])) throw new TypeError(`invalid ${name}`);
  }
  for (const name of ['anchor_state_root', 'transaction_binding']) decodeHex(statement[name], name, 32);
  for (const name of ['input_commitments', 'output_commitments', 'nullifiers']) {
    const values = statement[name];
    if (!Array.isArray(values) || !values.length || values.length > 4 || new Set(values).size !== values.length) throw new TypeError(`invalid ${name}`);
    for (const value of values) decodeHex(value, name, 32);
  }
  if (statement.nullifiers.length !== statement.input_commitments.length || statement.input_commitments.some(item => statement.output_commitments.includes(item))) throw new TypeError('invalid input/output relation');
  if (!Number.isSafeInteger(statement.public_amount) || statement.public_amount < 0) throw new TypeError('invalid public amount');
}
export function starkStatementDigest(statement) {
  assertStarkStatement(statement);
  return buildTranscriptHash({ domainTag: 'PROOF_STARK_V1', payload: statement });
}
