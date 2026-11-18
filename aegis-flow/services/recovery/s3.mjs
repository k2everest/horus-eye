import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, chmodSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { fileDigest } from './backup.mjs';
const exec = promisify(execFile);
export function assertS3Config(config) {
  if (!config || Object.keys(config).sort().join(',') !== 'bucket,expected_bucket_owner,kms_key_arn,prefix,region,schema' ||
    config.schema !== 'AEGIS_S3_BACKUP_TARGET_V1' || typeof config.bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) ||
    /\.\.|^\d+\.\d+\.\d+\.\d+$/.test(config.bucket) || !/^[a-z]{2}(?:-[a-z]+)+-[0-9]$/.test(config.region) || !/^[0-9]{12}$/.test(config.expected_bucket_owner) ||
    !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(config.prefix) || config.prefix.length > 128 ||
    !new RegExp(`^arn:aws(?:-us-gov|-cn)?:kms:${config.region}:${config.expected_bucket_owner}:key/[A-Za-z0-9-]{1,128}$`).test(config.kms_key_arn)) throw new Error('INVALID_S3_BACKUP_TARGET');
  return config;
}
async function defaultRunner(args) {
  try { const result = await exec('aws', args, { timeout: 600_000, maxBuffer: 65536,
    env: { ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off', AWS_MAX_ATTEMPTS: '3' } }); return JSON.parse(result.stdout || '{}'); }
  catch { throw new Error('S3_OPERATION_FAILED_CHECK_AWS_CLI_IAM_AND_TARGET'); }
}
export class S3BackupTarget {
  #config; #run;
  constructor(config, { runner = defaultRunner } = {}) { this.#config = structuredClone(assertS3Config(config)); this.#run = runner; }
  #call(operation, args = []) {
    return this.#run(['s3api', operation, '--bucket', this.#config.bucket, '--expected-bucket-owner', this.#config.expected_bucket_owner,
      '--region', this.#config.region, '--output', 'json', ...args]);
  }
  async #preflight() {
    const versioning = await this.#call('get-bucket-versioning');
    const publicAccess = await this.#call('get-public-access-block');
    if (versioning.Status !== 'Enabled' || !['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(k => publicAccess.PublicAccessBlockConfiguration?.[k] === true)) throw new Error('S3_REQUIRES_VERSIONING_AND_PUBLIC_ACCESS_BLOCK');
  }
  #prefix(id) { if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('INVALID_BACKUP_ID'); return `${this.#config.prefix}/${id}`; }
  async upload(directory) {
    const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
    const prefix = this.#prefix(manifest.context?.backup_id);
    if (await fileDigest(join(directory, 'ledger.enc')) !== manifest.ciphertext_sha256) throw new Error('BACKUP_UPLOAD_CHECKSUM_MISMATCH');
    await this.#preflight(); const objects = [];
    // Data first, authenticated manifest next, version receipt last as commit marker. No overwrite/delete is performed.
    for (const name of ['ledger.enc', 'manifest.json']) {
      const filename = join(directory, name); const digest = await fileDigest(filename);
      const result = await this.#call('put-object', ['--key', `${prefix}/${name}`, '--body', filename, '--if-none-match', '*',
        '--checksum-algorithm', 'SHA256', '--checksum-sha256', Buffer.from(digest, 'hex').toString('base64'),
        '--server-side-encryption', 'aws:kms', '--ssekms-key-id', this.#config.kms_key_arn]);
      if (!result.VersionId || result.VersionId === 'null' || result.ChecksumSHA256 !== Buffer.from(digest, 'hex').toString('base64') || result.ServerSideEncryption !== 'aws:kms' || result.SSEKMSKeyId !== this.#config.kms_key_arn) throw new Error('S3_UPLOAD_ACKNOWLEDGEMENT_INVALID');
      objects.push({ key: `${prefix}/${name}`, version_id: result.VersionId, sha256: digest });
    }
    const receipt = { schema: 'AEGIS_S3_BACKUP_RECEIPT_V1', backup_id: manifest.context.backup_id, bucket: this.#config.bucket, objects, external_copy_completed: true };
    const pendingReceipt = join(directory, 's3-receipt.pending.json');
    writeFileSync(pendingReceipt, JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    const receiptHash = await fileDigest(pendingReceipt);
    const committed = await this.#call('put-object', ['--key', `${prefix}/s3-receipt.json`, '--body', pendingReceipt, '--if-none-match', '*',
      '--checksum-algorithm', 'SHA256', '--checksum-sha256', Buffer.from(receiptHash, 'hex').toString('base64'),
      '--server-side-encryption', 'aws:kms', '--ssekms-key-id', this.#config.kms_key_arn]);
    if (!committed.VersionId || committed.VersionId === 'null' || committed.ChecksumSHA256 !== Buffer.from(receiptHash, 'hex').toString('base64') ||
      committed.ServerSideEncryption !== 'aws:kms' || committed.SSEKMSKeyId !== this.#config.kms_key_arn) throw new Error('S3_COMMIT_ACKNOWLEDGEMENT_INVALID');
    renameSync(pendingReceipt, join(directory, 's3-receipt.json'));
    return receipt;
  }
  async download({ backupId, destinationDirectory, receipt }) {
    const prefix = this.#prefix(backupId);
    if (existsSync(destinationDirectory)) throw new Error('BACKUP_DOWNLOAD_DESTINATION_EXISTS');
    mkdirSync(destinationDirectory, { mode: 0o700, recursive: true });
    try {
      if (!receipt) {
        const marker = join(destinationDirectory, 's3-receipt.json');
        await this.#call('get-object', ['--key', `${prefix}/s3-receipt.json`, '--checksum-mode', 'ENABLED', marker]);
        chmodSync(marker, 0o600);
        const raw = readFileSync(marker);
        if (raw.length > 65536) throw new Error('INVALID_S3_VERSION_RECEIPT');
        receipt = JSON.parse(raw.toString('utf8'));
      }
      if (!receipt || receipt.schema !== 'AEGIS_S3_BACKUP_RECEIPT_V1' || receipt.backup_id !== backupId || receipt.bucket !== this.#config.bucket ||
        !Array.isArray(receipt.objects) || receipt.objects.length !== 2) throw new Error('S3_VERSION_RECEIPT_REQUIRED');
      for (const name of ['manifest.json', 'ledger.enc']) {
        const object = receipt.objects.find(o => o.key === `${prefix}/${name}`);
        if (!object || typeof object.version_id !== 'string' || !object.version_id.length || !/^[0-9a-f]{64}$/.test(object.sha256)) throw new Error('INVALID_S3_VERSION_RECEIPT');
        const destination = join(destinationDirectory, name);
        await this.#call('get-object', ['--key', object.key, '--version-id', object.version_id, '--checksum-mode', 'ENABLED', destination]);
        chmodSync(destination, 0o600);
        if (await fileDigest(destination) !== object.sha256) throw new Error('S3_DOWNLOAD_CHECKSUM_MISMATCH');
      }
      return { directory: destinationDirectory, downloaded: true };
    } catch (error) { rmSync(destinationDirectory, { recursive: true, force: true }); throw error; }
  }
}
