import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { createValidationServer } from './server.mjs';
const openssl = spawnSync('openssl', ['version']);
test('TLS verifies the certificate, supports authenticated metrics and refuses TLS 1.2', { skip: Boolean(openssl.error) }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'aegis-tls-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const keyPath = join(directory, 'key.pem'); const certPath = join(directory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', keyPath, '-out', certPath], { stdio: 'ignore' });
  const cert = readFileSync(certPath); const token = crypto.randomBytes(32).toString('hex');
  const policyPath = join(directory, 'policy.json');
  writeFileSync(policyPath, JSON.stringify({ schema: 'AEGIS_ACCESS_POLICY_V1', incident_mode: 'normal', principals: [{ id: 'monitor', roles: ['monitor'],
    token_sha256: crypto.createHash('sha256').update(token).digest('hex'), expires_at: Date.now() + 60000 }] }), { mode: 0o600 });
  const server = createValidationServer({ sink: () => {}, accessPolicyPath: policyPath, tlsOptions: { key: readFileSync(keyPath), cert } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const request = extra => new Promise((resolve, reject) => {
    const req = https.get(`https://127.0.0.1:${server.address().port}/metrics`, { ca: cert, headers: { authorization: `Bearer ${token}` }, ...extra }, response => {
      const protocol = response.socket.getProtocol(); response.resume(); response.on('end', () => resolve({ status: response.statusCode, protocol }));
    }); req.on('error', reject); req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  });
  assert.deepEqual(await request(), { status: 200, protocol: 'TLSv1.3' });
  await assert.rejects(request({ maxVersion: 'TLSv1.2' }));
  await assert.rejects(request({ ca: undefined }));
});
