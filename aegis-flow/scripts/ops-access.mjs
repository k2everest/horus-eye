import crypto from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync, openSync, closeSync, fsyncSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { AccessPolicy } from '../services/operational-security/access.mjs';

const [action, directory, idOrMode, rolesText] = process.argv.slice(2);
if (!directory || !['issue', 'revoke', 'incident'].includes(action)) throw new Error('Usage: ops-access.mjs issue DIR ID reader,submitter | revoke DIR ID | incident DIR normal|read-only|halt');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const lockfile = join(directory, 'policy.lock');
const lock = openSync(lockfile, 'wx', 0o600); writeFileSync(lock, String(process.pid)); closeSync(lock);
try {
const filename = join(directory, 'access-policy.json');
const policy = existsSync(filename) ? new AccessPolicy({ filename }).load() : { schema: 'AEGIS_ACCESS_POLICY_V1', incident_mode: 'normal', principals: [] };
let tokenFile;
if (action === 'issue') {
  const roles = rolesText?.split(',');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(idOrMode ?? '') || !roles?.length || new Set(roles).size !== roles.length || roles.some(r => !['reader', 'submitter', 'finalizer', 'monitor'].includes(r))) throw new Error('INVALID_PRINCIPAL');
  const token = crypto.randomBytes(32).toString('hex');
  tokenFile = join(directory, `${idOrMode}-${crypto.randomUUID()}.token`);
  writeFileSync(tokenFile, token, { mode: 0o600, flag: 'wx' });
  policy.principals = policy.principals.filter(p => p.id !== idOrMode);
  policy.principals.push({ id: idOrMode, roles, token_sha256: crypto.createHash('sha256').update(token).digest('hex'), expires_at: Date.now() + 7 * 86400_000 });
  if (policy.principals.length > 128) throw new Error('PRINCIPAL_LIMIT');
} else if (action === 'revoke') {
  if (!policy.principals.some(p => p.id === idOrMode)) throw new Error('UNKNOWN_PRINCIPAL');
  policy.principals = policy.principals.filter(p => p.id !== idOrMode);
} else {
  if (!['normal', 'read-only', 'halt'].includes(idOrMode)) throw new Error('INVALID_INCIDENT_MODE');
  policy.incident_mode = idOrMode;
}
const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
const fd = openSync(temporary, 'wx', 0o600);
try { writeFileSync(fd, JSON.stringify(policy, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
renameSync(temporary, filename);
const dir = openSync(directory, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); }
console.log(JSON.stringify({ policy_file: filename, ...(tokenFile ? { token_file: tokenFile, expires_in_days: 7 } : {}), incident_mode: policy.incident_mode }));

} finally { unlinkSync(lockfile); }
