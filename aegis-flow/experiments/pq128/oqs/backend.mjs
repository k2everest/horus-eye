// Isolated, opt-in liboqs laboratory adapter. Nothing in node admission imports
// this module. A trusted local build manifest checks reproducibility inputs;
// it is not an attestation and must never come from a signature/proof sender.
import crypto from 'node:crypto';
import {accessSync, constants, readFileSync, statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {inspect} from 'node:util';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const OQS_LABORATORY_SCHEMA = 'AEGIS_OQS_LABORATORY_BUILD_V1';
export const OQS_VERSION = '0.16.0';
export const OQS_SOURCE_COMMIT = '5a1a854b0dc9f2141bdc771c555ee60c37950183';
export const OQS_ALGORITHMS = Object.freeze(['ML-DSA-87', 'ML-KEM-1024']);
export const OQS_SIZES = Object.freeze({
  'ML-DSA-87': Object.freeze({public_key:2592, signature:4627}),
  'ML-KEM-1024': Object.freeze({public_key:1568, ciphertext:1568, shared_secret:32}),
});
const HERE = fileURLToPath(new URL('./', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const MAX_MESSAGE = 65536, MAX_HELPER = 32 * 1024 * 1024;
const SPKI_PREFIX = Object.freeze({
  // RFC 9881 / RFC 9935 OIDs, absent parameters and zero unused BIT STRING bits.
  'ML-DSA-87':'30820a32300b060960864801650304031303820a2100',
  'ML-KEM-1024':'30820632300b06096086480165030404030382062100',
});
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalHash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const failOperation = () => new Error('OQS_LABORATORY_OPERATION_FAILED');
function algorithmRequired(algorithm, expected) {
  if (!OQS_ALGORITHMS.includes(algorithm) || (expected && algorithm !== expected)) throw new TypeError('unapproved laboratory algorithm');
}
function boundedBytes(value, length, name) {
  if (!(value instanceof Uint8Array) || (length === undefined ? value.length > MAX_MESSAGE : value.length !== length)) {
    throw new TypeError(`invalid laboratory ${name}`);
  }
  return Buffer.from(value);
}
function u32(value) { const out = Buffer.alloc(4); out.writeUInt32BE(value); return out; }
function readBounded(path, max) {
  const info = statSync(path);
  if (!info.isFile() || info.size < 1 || info.size > max) throw new Error('invalid local laboratory file');
  return readFileSync(path);
}
function assertNodeRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 8) || typeof crypto.encapsulate !== 'function') {
    throw new Error('OQS interoperation requires Node.js >=24.8; no fallback is available');
  }
}

// These conversions accept only the canonical, fixed-length SPKI representation
// of the two approved public-key formats. No private-key DER crosses the bridge.
export function encodeSpkiPublicKey({algorithm, publicKey}) {
  algorithmRequired(algorithm);
  return Buffer.concat([Buffer.from(SPKI_PREFIX[algorithm], 'hex'), boundedBytes(publicKey, OQS_SIZES[algorithm].public_key, 'public key')]);
}
export function decodeSpkiPublicKey({algorithm, spki}) {
  algorithmRequired(algorithm);
  const prefix = Buffer.from(SPKI_PREFIX[algorithm], 'hex');
  const der = boundedBytes(spki, prefix.length + OQS_SIZES[algorithm].public_key, 'SPKI');
  if (!der.subarray(0, prefix.length).equals(prefix)) throw new TypeError('noncanonical laboratory SPKI');
  return Buffer.from(der.subarray(prefix.length));
}
export function nodePublicKeyToRaw({algorithm, publicKey}) {
  algorithmRequired(algorithm); assertNodeRuntime();
  if (!(publicKey instanceof crypto.KeyObject) || publicKey.type !== 'public' || publicKey.asymmetricKeyType !== algorithm.toLowerCase()) {
    throw new TypeError('approved Node public key required');
  }
  return decodeSpkiPublicKey({algorithm, spki:publicKey.export({type:'spki', format:'der'})});
}
export function rawPublicKeyToNode({algorithm, publicKey}) {
  algorithmRequired(algorithm); assertNodeRuntime();
  const key = crypto.createPublicKey({key:encodeSpkiPublicKey({algorithm, publicKey}), type:'spki', format:'der'});
  if (key.type !== 'public' || key.asymmetricKeyType !== algorithm.toLowerCase()) throw new TypeError('approved Node public key required');
  return key;
}

// The caller owns the exposed Buffer and must derive a key and dispose promptly.
// dispose() clears this owned Buffer only: JS, OpenSSL, the OS and caller copies
// may retain other copies, so this is not a complete memory-erasure guarantee.
export class OqsEncapsulation {
  #secret; #disposed = false;
  constructor({ciphertext, sharedSecret}) {
    this.ciphertext = boundedBytes(ciphertext, OQS_SIZES['ML-KEM-1024'].ciphertext, 'ciphertext');
    this.#secret = boundedBytes(sharedSecret, OQS_SIZES['ML-KEM-1024'].shared_secret, 'shared secret');
    this.kem_algorithm = 'ML-KEM-1024';
    this.aegis_target_met = false; this.production_ready = false;
    Object.freeze(this);
  }
  get shared_secret() {
    if (this.#disposed) throw new Error('OQS_SHARED_SECRET_DISPOSED');
    return this.#secret;
  }
  dispose() { this.#secret.fill(0); this.#disposed = true; }
  toJSON() { throw new Error('PRIVATE_OQS_SHARED_SECRET_NOT_SERIALIZABLE'); }
  [inspect.custom]() {
    return `OqsEncapsulation { kem_algorithm: 'ML-KEM-1024', ciphertext_bytes: 1568, shared_secret: [REDACTED], disposed: ${this.#disposed} }`;
  }
}

export class OqsLaboratoryBackend {
  #manifestPath; #helperPath; #timeout;
  constructor({manifestPath = join(ROOT, 'work/oqs/manifest.json'), helperPath = join(ROOT, 'work/oqs/bin/aegis-oqs-helper'), timeoutMs = 10000} = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new TypeError('invalid laboratory operation timeout');
    this.#manifestPath = resolve(manifestPath); this.#helperPath = resolve(helperPath); this.#timeout = timeoutMs;
  }
  #trustedBuild() {
    try {
      const lock = JSON.parse(readBounded(join(HERE, 'tools.lock.json'), 16384));
      const m = JSON.parse(readBounded(this.#manifestPath, 16384));
      if (lock.schema !== 'AEGIS_OQS_TOOLS_LOCK_V1' || lock.liboqs_version !== OQS_VERSION || lock.source_commit !== OQS_SOURCE_COMMIT || !canonicalHash(lock.archive_sha256) ||
          !exactKeys(m, ['schema','liboqs_version','source_commit','bridge_source_sha256','archive_sha256','binary_sha256','helper_path','aegis_target_met','production_ready']) ||
          m.schema !== OQS_LABORATORY_SCHEMA || m.liboqs_version !== lock.liboqs_version || m.source_commit !== lock.source_commit ||
          m.archive_sha256 !== lock.archive_sha256 || m.helper_path !== 'bin/aegis-oqs-helper' || m.aegis_target_met !== false || m.production_ready !== false ||
          !canonicalHash(m.bridge_source_sha256) || !canonicalHash(m.binary_sha256) ||
          digest(readBounded(join(HERE, 'bridge.c'), 256 * 1024)) !== m.bridge_source_sha256 || digest(readBounded(this.#helperPath, MAX_HELPER)) !== m.binary_sha256) {
        throw new Error('untrusted local laboratory build');
      }
      accessSync(this.#helperPath, constants.X_OK);
      return m;
    } catch { throw new Error('OQS_LABORATORY_UNAVAILABLE'); }
  }
  available() { try { this.#trustedBuild(); return true; } catch { return false; } }
  async #execute(mode, input, maxOutput) {
    this.#trustedBuild();
    // Secrets use anonymous pipes. Only the public mode is in argv; do not pass
    // inherited environment values, child stderr, or private output to logs.
    return new Promise((resolveOutput, reject) => {
      let child, timer, done = false, failed = false, outputBytes = 0, stderrBytes = 0;
      const chunks = [];
      const finish = success => {
        if (done) return;
        done = true; clearTimeout(timer);
        const output = success ? Buffer.concat(chunks, outputBytes) : null;
        for (const chunk of chunks) chunk.fill(0);
        child?.stdin.destroy(); child?.stdout.destroy(); child?.stderr.destroy();
        if (success) resolveOutput(output); else reject(failOperation());
      };
      const fail = () => { failed = true; child?.kill('SIGKILL'); };
      try {
        child = spawn(this.#helperPath, [mode], {env:{LANG:'C', LC_ALL:'C'}, cwd:ROOT, shell:false, windowsHide:true, stdio:['pipe','pipe','pipe']});
        timer = setTimeout(fail, this.#timeout); timer.unref();
        child.on('error', () => finish(false));
        child.on('close', (code, signal) => finish(!failed && code === 0 && signal === null));
        child.stdin.on('error', fail); child.stdout.on('error', fail); child.stderr.on('error', fail);
        child.stdout.on('data', chunk => {
          if (done || failed) { chunk.fill(0); return; }
          outputBytes += chunk.length;
          if (outputBytes > maxOutput) { chunk.fill(0); fail(); return; }
          chunks.push(chunk);
        });
        child.stderr.on('data', chunk => {
          stderrBytes += chunk.length;
          chunk.fill(0);
          if (stderrBytes > 4096) fail();
        });
        child.stdin.end(input);
      } catch { child?.kill('SIGKILL'); finish(false); }
    });
  }
  async metadata() {
    const out = await this.#execute('metadata', Buffer.alloc(0), 4096);
    try {
      const m = JSON.parse(out.toString('utf8'));
      if (!exactKeys(m, ['liboqs_version','allowed_algorithms','sizes','aegis_target_met','production_ready']) || m.liboqs_version !== OQS_VERSION ||
          JSON.stringify(m.allowed_algorithms) !== JSON.stringify(OQS_ALGORITHMS) ||
          !exactKeys(m.sizes, OQS_ALGORITHMS) || !exactKeys(m.sizes['ML-DSA-87'], ['public_key','signature']) ||
          !exactKeys(m.sizes['ML-KEM-1024'], ['public_key','ciphertext','shared_secret']) ||
          OQS_ALGORITHMS.some(a => Object.entries(OQS_SIZES[a]).some(([k,v]) => m.sizes[a][k] !== v)) ||
          m.aegis_target_met !== false || m.production_ready !== false) throw failOperation();
      return m;
    } catch { throw failOperation(); } finally { out.fill(0); }
  }
  async verifyRaw({algorithm = 'ML-DSA-87', publicKey, message, signature} = {}) {
    algorithmRequired(algorithm, 'ML-DSA-87');
    const pk = boundedBytes(publicKey, 2592, 'public key'), msg = boundedBytes(message, undefined, 'message'), sig = boundedBytes(signature, 4627, 'signature');
    const input = Buffer.concat([u32(pk.length), u32(msg.length), u32(sig.length), pk, msg, sig]);
    const out = await this.#execute('verify87', input, 256);
    try {
      const status = JSON.parse(out.toString('utf8'));
      if (!exactKeys(status, ['valid']) || typeof status.valid !== 'boolean') throw failOperation();
      return {valid:status.valid, signature_algorithm:algorithm, aegis_target_met:false, production_ready:false};
    } catch { throw failOperation(); } finally { out.fill(0); }
  }
  async sampleSignature({algorithm = 'ML-DSA-87', message} = {}) {
    algorithmRequired(algorithm, 'ML-DSA-87');
    const msg = boundedBytes(message, undefined, 'message');
    const out = await this.#execute('sample87', Buffer.concat([u32(msg.length), msg]), 8 + 2592 + 4627);
    try {
      if (out.length !== 8 + 2592 + 4627 || out.readUInt32BE(0) !== 2592 || out.readUInt32BE(4) !== 4627) throw failOperation();
      return {signature_algorithm:algorithm, publicKey:Buffer.from(out.subarray(8, 8 + 2592)), signature:Buffer.from(out.subarray(8 + 2592)), aegis_target_met:false, production_ready:false};
    } finally { out.fill(0); }
  }
  async encapsulateRaw({algorithm = 'ML-KEM-1024', publicKey} = {}) {
    algorithmRequired(algorithm, 'ML-KEM-1024');
    const pk = boundedBytes(publicKey, 1568, 'public key');
    const out = await this.#execute('encap1024', Buffer.concat([u32(pk.length), pk]), 8 + 1568 + 32);
    try {
      if (out.length !== 8 + 1568 + 32 || out.readUInt32BE(0) !== 1568 || out.readUInt32BE(4) !== 32) throw failOperation();
      return new OqsEncapsulation({ciphertext:out.subarray(8, 8 + 1568), sharedSecret:out.subarray(8 + 1568)});
    } finally { out.fill(0); }
  }
  async encapsulateNodePublicKey({algorithm = 'ML-KEM-1024', publicKey} = {}) {
    algorithmRequired(algorithm, 'ML-KEM-1024');
    return this.encapsulateRaw({algorithm, publicKey:nodePublicKeyToRaw({algorithm, publicKey})});
  }
}
