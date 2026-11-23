import crypto from 'node:crypto';
import { openSync, readFileSync, fstatSync, closeSync, constants } from 'node:fs';

export function readRestrictedFile(filename, maxBytes = 65536) {
  const fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.size < 1 || stat.size > maxBytes) throw new Error('RESTRICTED_FILE_REQUIRED');
    return readFileSync(fd, 'utf8');
  } finally { closeSync(fd); }
}
export function readBearerSecret(filename) {
  const value = readRestrictedFile(filename, 256).trim();
  if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('INVALID_BEARER_SECRET');
  return value;
}
const loopback = ip => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
const ROLES = ['reader', 'submitter', 'finalizer', 'monitor'];
export function classifyRoute(method, url) {
  if (url === '/healthz' && method === 'GET') return { name: 'health', role: null };
  if (url === '/metrics' && method === 'GET') return { name: 'metrics', role: 'monitor' };
  if (url === '/readyz' && method === 'GET') return { name: 'ready', role: 'monitor' };
  if (method === 'POST' && url === '/validate') return { name: 'validate', role: 'submitter' };
  if (method === 'POST' && url === '/submit') return { name: 'submit', role: 'submitter' };
  if (method === 'POST' && url === '/settlement/certificates') return { name: 'finalize', role: 'finalizer' };
  if (method === 'GET' && (/^\/receipts\/[A-Za-z0-9_-]{1,128}$/.test(url) || /^\/transactions\/[0-9a-f]{64}$/.test(url) ||
    /^\/ledger\/(root|proof\/[0-9a-f]{64})$/.test(url) || /^\/settlement\/(config|status|(certificates|blocks)\/[1-9][0-9]{0,14}|proof\/[0-9a-f]{64})$/.test(url))) return { name: 'read', role: 'reader' };
  return { name: 'unknown', role: 'reader' };
}
export class AccessPolicy {
  #filename; #now;
  constructor({ filename, now = Date.now } = {}) { this.#filename = filename; this.#now = now; }
  get configured() { return Boolean(this.#filename); }
  load() {
    if (!this.#filename) return { incident_mode: 'normal', principals: [] };
    let policy;
    try { policy = JSON.parse(readRestrictedFile(this.#filename)); }
    catch { throw new Error('ACCESS_POLICY_UNAVAILABLE'); }
    if (!policy || typeof policy !== 'object' || Array.isArray(policy) || Object.keys(policy).sort().join(',') !== 'incident_mode,principals,schema' || policy.schema !== 'AEGIS_ACCESS_POLICY_V1' ||
      !['normal', 'read-only', 'halt'].includes(policy.incident_mode) || !Array.isArray(policy.principals) || policy.principals.length > 128) throw new Error('INVALID_ACCESS_POLICY');
    const ids = new Set(); const hashes = new Set();
    for (const p of policy.principals) {
      if (!p || Object.keys(p).sort().join(',') !== 'expires_at,id,roles,token_sha256' || typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(p.id) || ids.has(p.id) ||
        typeof p.token_sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(p.token_sha256) || hashes.has(p.token_sha256) || !Array.isArray(p.roles) || !p.roles.length ||
        new Set(p.roles).size !== p.roles.length || p.roles.some(r => !ROLES.includes(r)) || !Number.isSafeInteger(p.expires_at) || p.expires_at < 0) throw new Error('INVALID_ACCESS_POLICY');
      ids.add(p.id); hashes.add(p.token_sha256);
    }
    return policy;
  }
  authorize(req, route, policy) {
    if (!route.role) return { allowed: true, principal: 'probe' };
    if (!this.#filename) return loopback(req.socket.remoteAddress) ? { allowed: true, principal: 'loopback-demo' } : { allowed: false, status: 403, code: 'LOCAL_DEMO_ONLY' };
    if (!req.socket.encrypted && !loopback(req.socket.remoteAddress)) return { allowed: false, status: 403, code: 'TLS_REQUIRED' };
    const header = req.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer [0-9a-f]{64}$/.test(header)) return { allowed: false, status: 401, code: 'AUTHENTICATION_REQUIRED' };
    const digest = crypto.createHash('sha256').update(header.slice(7)).digest();
    const principal = policy.principals.find(p => crypto.timingSafeEqual(digest, Buffer.from(p.token_sha256, 'hex')));
    if (!principal || principal.expires_at <= this.#now()) return { allowed: false, status: 401, code: 'AUTHENTICATION_REQUIRED' };
    if (!principal.roles.includes(route.role)) return { allowed: false, status: 403, code: 'ROLE_FORBIDDEN' };
    return { allowed: true, principal: principal.id };
  }
}

// Fixed windows with bounded cardinality. Untrusted forwarding headers are ignored.
export class RequestLimits {
  #buckets = new Map(); #clock; #maxKeys; #limits;
  constructor({ clock = () => performance.now(), maxKeys = 4096, perIp = 600, perPrincipal = 300, writePerPrincipal = 10, global = 1200, windowMs = 60_000 } = {}) {
    for (const n of [maxKeys, perIp, perPrincipal, writePerPrincipal, global, windowMs]) if (!Number.isSafeInteger(n) || n < 1) throw new Error('INVALID_RATE_LIMIT');
    this.#clock = clock; this.#maxKeys = maxKeys; this.#limits = { perIp, perPrincipal, writePerPrincipal, global, windowMs };
  }
  #take(key, limit) {
    const now = this.#clock();
    if (this.#buckets.size >= this.#maxKeys) for (const [name, bucket] of this.#buckets) if (bucket.until <= now) this.#buckets.delete(name);
    let bucket = this.#buckets.get(key);
    if (!bucket) { if (this.#buckets.size >= this.#maxKeys) return false; bucket = { count: 0, until: now + this.#limits.windowMs }; this.#buckets.set(key, bucket); }
    if (bucket.until <= now) { bucket.count = 0; bucket.until = now + this.#limits.windowMs; }
    bucket.count++; return bucket.count <= limit;
  }
  connection(ip) { return this.#take('global', this.#limits.global) && this.#take(`ip:${ip}`, this.#limits.perIp); }
  principal(id, write) { return this.#take(`principal:${id}:${write ? 'write' : 'read'}`, write ? this.#limits.writePerPrincipal : this.#limits.perPrincipal); }
}
