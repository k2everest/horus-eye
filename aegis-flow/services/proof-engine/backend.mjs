import crypto from 'node:crypto';
import { accessSync, constants, readFileSync, mkdtempSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { assertStarkStatement, starkStatementDigest } from '../../libs/crypto-core/stark-statement.mjs';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENGINE = fileURLToPath(new URL('./', import.meta.url));
const MAX_RECEIPT = 8 * 1024 * 1024;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const STARK_SCHEME = 'RISC0-COMPOSITE-STARK-V1';

export class StarkBackend {
  #manifest;
  #r0vm;
  #program;
  #verifier;
  #timeout;
  #sourceValid = false;
  #proverValid = false;

  constructor({ r0vmPath = process.env.AEGIS_R0VM || join(ROOT, 'work/risc0/bin/r0vm'),
    programPath = process.env.AEGIS_STARK_PROGRAM || join(ROOT, 'work/risc0/aegis-transfer.bin'),
    verifierPath = process.env.AEGIS_STARK_VERIFIER || join(ROOT, 'work/stark-target/host/release/aegis-stark-verifier'),
    timeoutMs = 600_000 } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) throw new TypeError('invalid proof timeout');
    this.#manifest = JSON.parse(readFileSync(join(ENGINE, 'program.json'), 'utf8'));
    this.#r0vm = resolve(r0vmPath); this.#program = resolve(programPath); this.#verifier = resolve(verifierPath); this.#timeout = timeoutMs;
  }
  get programId() { return this.#manifest.program_id; }

  #checkVerifier() {
    accessSync(this.#verifier, constants.X_OK);
    if (!this.#sourceValid) {
      const digest = crypto.createHash('sha256');
      for (const name of this.#manifest.source_files) digest.update(`${name}\0`).update(readFileSync(join(ENGINE, name)));
      if (digest.digest('hex') !== this.#manifest.source_sha256 || !/^[0-9a-f]{64}$/.test(this.programId)) throw new Error('STARK_PROGRAM_SOURCE_MISMATCH');
      this.#sourceValid = true;
    }
  }
  #checkProver() {
    this.#checkVerifier();
    if (!this.#proverValid) {
      accessSync(this.#r0vm, constants.X_OK);
      const tools = JSON.parse(readFileSync(join(ENGINE, 'tools.lock.json'), 'utf8'));
      if (hash(readFileSync(this.#r0vm)) !== tools.r0vm_sha256 || hash(readFileSync(this.#program)) !== this.#manifest.program_binary_sha256) throw new Error('STARK_TOOL_OR_PROGRAM_MISMATCH');
      this.#proverValid = true;
    }
  }
  availableForVerification() { try { this.#checkVerifier(); return true; } catch { return false; } }
  availableForProving() { try { this.#checkProver(); return true; } catch { return false; } }

  async #execute(file, args, timeout = this.#timeout) {
    return run(file, args, {
      env: { ...process.env, RISC0_DEV_MODE: '0', RAYON_NUM_THREADS: '2' },
      timeout, maxBuffer: 256 * 1024,
    });
  }

  async prove({ statement, witness }) {
    this.#checkProver();
    statement = structuredClone(statement); witness = structuredClone(witness);
    assertStarkStatement(statement);
    if (!witness || Object.keys(witness).sort().join(',') !== 'inputs,outputs') throw new Error('INVALID_WITNESS');
    const payload = JSON.stringify({ statement, ...witness });
    if (Buffer.byteLength(payload) > 262144) throw new Error('WITNESS_TOO_LARGE');
    const directory = mkdtempSync(join(tmpdir(), 'aegis-stark-prove-'));
    try {
      const input = join(directory, 'witness.json');
      const output = join(directory, 'receipt.bin');
      writeFileSync(input, payload, { mode: 0o600 });
      await this.#execute(this.#r0vm, ['--elf', this.#program, '--initial-input', input, '--receipt', output,
        '--receipt-kind', 'composite', '--hashfn', 'poseidon2', '--po2', '18']);
      if (statSync(output).size > MAX_RECEIPT) throw new Error('RECEIPT_TOO_LARGE');
      const proof = {
        scheme: STARK_SCHEME, program_id: this.programId, statement_digest: starkStatementDigest(statement),
        receipt: readFileSync(output).toString('base64'),
      };
      if (!(await this.verify({ statement, proof })).valid) throw new Error('GENERATED_PROOF_FAILED_VERIFICATION');
      return proof;
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }

  async verify({ statement, proof }) {
    this.#checkVerifier();
    let directory;
    try {
      assertStarkStatement(statement);
      if (!proof || typeof proof !== 'object' || Object.keys(proof).sort().join(',') !== 'program_id,receipt,scheme,statement_digest' ||
          proof.scheme !== STARK_SCHEME || proof.program_id !== this.programId || proof.statement_digest !== starkStatementDigest(statement) ||
          typeof proof.receipt !== 'string' || proof.receipt.length > Math.ceil(MAX_RECEIPT / 3) * 4) return { valid: false };
      const bytes = Buffer.from(proof.receipt, 'base64');
      if (!bytes.length || bytes.length > MAX_RECEIPT || bytes.toString('base64') !== proof.receipt) return { valid: false };
      directory = mkdtempSync(join(tmpdir(), 'aegis-stark-verify-'));
      const receipt = join(directory, 'receipt.bin');
      const expected = join(directory, 'statement.json');
      writeFileSync(receipt, bytes, { mode: 0o600 });
      writeFileSync(expected, JSON.stringify(statement), { mode: 0o600 });
      const result = await this.#execute(this.#verifier, [receipt, expected, this.programId], Math.min(this.#timeout, 10_000));
      const status = JSON.parse(result.stdout);
      return { valid: status.valid === true && status.backend === 'risc0-composite-3.1.0', proof_digest: hash(bytes), program_id: this.programId };
    } catch { return { valid: false }; }
    finally { if (directory) rmSync(directory, { recursive: true, force: true }); }
  }
}

export function defaultStarkBackend() { return new StarkBackend(); }
