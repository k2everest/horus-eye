import test from 'node:test';
import assert from 'node:assert/strict';

import { validateShieldedTx } from './index.mjs';

test('deve gerar logs estruturados sem vazar tx_blob', () => {
  const logs = [];
  const sink = (line) => logs.push(line);

  const response = validateShieldedTx(
    {
      tx_blob: '0123456789abcdef0123456789abcdef',
      request_id: 'req-123',
    },
    sink,
  );

  assert.equal(response.valid, true);
  assert.equal(logs.length, 2);

  const parsed = logs.map((line) => JSON.parse(line));
  parsed.forEach((entry) => {
    assert.equal(entry.request_id, 'req-123');
    assert.equal(entry.method, 'ValidateShieldedTx');
    assert.ok(entry.tx_id_hash);
    assert.equal('tx_blob' in entry, false);
  });
});
