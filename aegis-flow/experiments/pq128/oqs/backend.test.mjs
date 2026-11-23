import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspect} from 'node:util';
import {OqsLaboratoryBackend, OqsEncapsulation, OQS_LABORATORY_SCHEMA, OQS_VERSION, OQS_SOURCE_COMMIT, OQS_ALGORITHMS, OQS_SIZES,
  encodeSpkiPublicKey, decodeSpkiPublicKey, nodePublicKeyToRaw, rawPublicKeyToNode} from './backend.mjs';
const here = fileURLToPath(new URL('./', import.meta.url));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('an absent or malformed trusted local build fails closed without selecting a fallback', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-oqs-unavailable-'));
  try {
    const manifestPath = join(dir, 'manifest.json');
    const backend = new OqsLaboratoryBackend({manifestPath, helperPath:join(dir, 'absent-helper')});
    assert.equal(backend.available(), false);
    await assert.rejects(backend.metadata(), /^Error: OQS_LABORATORY_UNAVAILABLE$/);
    for (const contents of ['{', '{}', '[]', JSON.stringify({schema:OQS_LABORATORY_SCHEMA, production_ready:true}),
      JSON.stringify({schema:OQS_LABORATORY_SCHEMA, liboqs_version:'0.16.0', source_commit:'00'.repeat(20),
        archive_sha256:'00'.repeat(32), bridge_source_sha256:'00'.repeat(32), binary_sha256:'00'.repeat(32),
        helper_path:'../../untrusted-helper', aegis_target_met:false, production_ready:false}), ' '.repeat(16385)]) {
      writeFileSync(manifestPath, contents);
      assert.equal(backend.available(), false);
      await assert.rejects(backend.metadata(), /^Error: OQS_LABORATORY_UNAVAILABLE$/);
    }
    await assert.rejects(backend.sampleSignature({message:Buffer.from('public test')}), /OQS_LABORATORY_UNAVAILABLE/);
    await assert.rejects(backend.verifyRaw({publicKey:Buffer.alloc(2592), message:Buffer.alloc(0), signature:Buffer.alloc(4627)}), /OQS_LABORATORY_UNAVAILABLE/);
    await assert.rejects(backend.encapsulateRaw({publicKey:Buffer.alloc(1568)}), /OQS_LABORATORY_UNAVAILABLE/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('local source and binary hashes fail closed and child failures expose no diagnostics', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aegis-oqs-guard-'));
  try {
    const manifestPath = join(dir, 'manifest.json'), helperPath = join(dir, 'failure-only-helper');
    // This executable can only fail. It never implements or claims a successful
    // cryptographic operation; genuine success belongs to integration.test.mjs.
    const failingHelper = '#!/bin/sh\nprintf PRIVATE_FAILURE_FIXTURE >&2\nexit 73\n';
    writeFileSync(helperPath, failingHelper, {mode:0o700});
    const manifest = {
      schema:OQS_LABORATORY_SCHEMA, liboqs_version:OQS_VERSION, source_commit:OQS_SOURCE_COMMIT,
      bridge_source_sha256:sha256(readFileSync(join(here, 'bridge.c'))),
      archive_sha256:JSON.parse(readFileSync(join(here, 'tools.lock.json'), 'utf8')).archive_sha256,
      binary_sha256:sha256(failingHelper), helper_path:'bin/aegis-oqs-helper',
      aegis_target_met:false, production_ready:false,
    };
    const backend = new OqsLaboratoryBackend({manifestPath, helperPath});
    writeFileSync(manifestPath, JSON.stringify(manifest));
    // A matching local manifest is a file-integrity guard, not a liboqs
    // attestation. Even a trusted process failure must remain a failure.
    assert.equal(backend.available(), true);
    await assert.rejects(backend.metadata(), /^Error: OQS_LABORATORY_OPERATION_FAILED$/);
    await assert.rejects(backend.sampleSignature({message:Buffer.alloc(0)}), /^Error: OQS_LABORATORY_OPERATION_FAILED$/);
    await assert.rejects(backend.verifyRaw({publicKey:Buffer.alloc(2592), message:Buffer.alloc(0), signature:Buffer.alloc(4627)}), /^Error: OQS_LABORATORY_OPERATION_FAILED$/);
    await assert.rejects(backend.encapsulateRaw({publicKey:Buffer.alloc(1568)}), /^Error: OQS_LABORATORY_OPERATION_FAILED$/);
    for (const changed of [
      {...manifest, schema:'UNTRUSTED'}, {...manifest, liboqs_version:'0.15.0'},
      {...manifest, source_commit:'00'.repeat(20)}, {...manifest, bridge_source_sha256:'00'.repeat(32)},
      {...manifest, archive_sha256:'00'.repeat(32)}, {...manifest, binary_sha256:'00'.repeat(32)},
      {...manifest, helper_path:'../failure-only-helper'}, {...manifest, aegis_target_met:true},
      {...manifest, production_ready:true}, {...manifest, unknown:true},
    ]) {
      writeFileSync(manifestPath, JSON.stringify(changed));
      assert.equal(backend.available(), false);
      await assert.rejects(backend.metadata(), /^Error: OQS_LABORATORY_UNAVAILABLE$/);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(helperPath, `${failingHelper}# changed bytes\n`);
    assert.equal(backend.available(), false);
    await assert.rejects(backend.metadata(), /^Error: OQS_LABORATORY_UNAVAILABLE$/);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});

test('only bounded byte inputs and the exact approved algorithm can reach a helper', async () => {
  const backend = new OqsLaboratoryBackend({manifestPath:'/absent/aegis-oqs-manifest'});
  for (const algorithm of ['ML-DSA-44','ML-DSA-65','ML-KEM-768','ml-dsa-87','unknown',null]) {
    await assert.rejects(backend.verifyRaw({algorithm}), /unapproved laboratory algorithm/);
    await assert.rejects(backend.sampleSignature({algorithm}), /unapproved laboratory algorithm/);
    await assert.rejects(backend.encapsulateRaw({algorithm}), /unapproved laboratory algorithm/);
  }
  await assert.rejects(backend.verifyRaw({algorithm:'ML-KEM-1024'}), /unapproved laboratory algorithm/);
  await assert.rejects(backend.encapsulateRaw({algorithm:'ML-DSA-87'}), /unapproved laboratory algorithm/);
  for (const message of [undefined, 'not bytes', [], new DataView(new ArrayBuffer(1)), Buffer.alloc(65537)]) {
    await assert.rejects(backend.sampleSignature({message}), /invalid laboratory message/);
    await assert.rejects(backend.verifyRaw({publicKey:Buffer.alloc(2592), message, signature:Buffer.alloc(4627)}), /invalid laboratory message/);
  }
  for (const publicKey of [undefined, '00', Buffer.alloc(2591), Buffer.alloc(2593)]) {
    await assert.rejects(backend.verifyRaw({publicKey, message:Buffer.alloc(0), signature:Buffer.alloc(4627)}), /invalid laboratory public key/);
  }
  for (const signature of [undefined, '00', Buffer.alloc(4626), Buffer.alloc(4628)]) {
    await assert.rejects(backend.verifyRaw({publicKey:Buffer.alloc(2592), message:Buffer.alloc(0), signature}), /invalid laboratory signature/);
  }
  for (const publicKey of [undefined, '00', Buffer.alloc(1567), Buffer.alloc(1569)]) {
    await assert.rejects(backend.encapsulateRaw({publicKey}), /invalid laboratory public key/);
  }
  for (const timeoutMs of [0, 99, 120001, NaN, Infinity, 100.5]) assert.throws(() => new OqsLaboratoryBackend({timeoutMs}), /invalid laboratory operation timeout/);
});

test('raw public keys round-trip through only the canonical Node SPKI encodings', () => {
  for (const algorithm of OQS_ALGORITHMS) {
    const pair = crypto.generateKeyPairSync(algorithm.toLowerCase());
    const raw = nodePublicKeyToRaw({algorithm, publicKey:pair.publicKey});
    assert.equal(raw.length, OQS_SIZES[algorithm].public_key);
    const der = pair.publicKey.export({type:'spki', format:'der'});
    assert.deepEqual(encodeSpkiPublicKey({algorithm, publicKey:raw}), der);
    assert.deepEqual(decodeSpkiPublicKey({algorithm, spki:der}), raw);
    assert.deepEqual(rawPublicKeyToNode({algorithm, publicKey:raw}).export({type:'spki', format:'der'}), der);
    assert.throws(() => nodePublicKeyToRaw({algorithm, publicKey:pair.privateKey}), /approved Node public key required/);
    assert.throws(() => nodePublicKeyToRaw({algorithm, publicKey:pair.publicKey.export({type:'spki',format:'pem'})}), /approved Node public key required/);
    for (const bad of [der.subarray(1), Buffer.concat([der, Buffer.from([0])]),
      Buffer.from(der).fill(0, 16, 17), // Different OID.
      Buffer.from(der).fill(0, 17, 18), // Different BIT STRING tag.
      Buffer.from(der).fill(1, 21, 22), // Nonzero unused BIT STRING bits.
      Buffer.from(der).fill(0x80, 1, 2), // Indefinite outer length.
      Buffer.from(der).fill(0x81, 1, 2), // Different outer length encoding.
      Buffer.concat([der.subarray(0,17), Buffer.from([5,0]), der.subarray(17)])]) { // NULL algorithm parameters.
      assert.throws(() => decodeSpkiPublicKey({algorithm, spki:bad}), /laboratory SPKI/);
    }
    const other = algorithm === 'ML-DSA-87' ? 'ML-KEM-1024' : 'ML-DSA-87';
    assert.throws(() => nodePublicKeyToRaw({algorithm:other, publicKey:pair.publicKey}), /approved Node public key required/);
    assert.throws(() => encodeSpkiPublicKey({algorithm, publicKey:raw.subarray(1)}), /invalid laboratory public key/);
  }
  for (const algorithm of ['ML-DSA-65','ML-KEM-768',undefined]) {
    assert.throws(() => encodeSpkiPublicKey({algorithm, publicKey:Buffer.alloc(0)}), /unapproved laboratory algorithm/);
    assert.throws(() => decodeSpkiPublicKey({algorithm, spki:Buffer.alloc(0)}), /unapproved laboratory algorithm/);
  }
});

test('the shared-secret wrapper redacts inspection, rejects JSON and clears its owned Buffer', () => {
  // This fixture tests the container only; it is not a cryptographic result.
  const fixtureSecret = Buffer.alloc(32, 0xa5), ciphertext = Buffer.alloc(1568, 0x3c);
  const result = new OqsEncapsulation({ciphertext, sharedSecret:fixtureSecret});
  const owned = result.shared_secret;
  assert.notEqual(owned, fixtureSecret);
  assert.equal(owned.length, 32);
  assert.equal(Object.keys(result).includes('shared_secret'), false);
  assert.equal(Object.keys({...result}).includes('shared_secret'), false);
  assert.equal(Object.keys(structuredClone(result)).includes('shared_secret'), false);
  assert.equal(Object.getOwnPropertyNames(result).includes('shared_secret'), false);
  assert.match(inspect(result), /shared_secret: \[REDACTED\]/);
  assert.equal(inspect(result).includes(fixtureSecret.toString('hex')), false);
  assert.equal(inspect(result, {customInspect:false, showHidden:true}).includes(fixtureSecret.toString('hex')), false);
  assert.equal(inspect(result, {customInspect:false, showHidden:true}).includes('a5 a5 a5'), false);
  assert.throws(() => JSON.stringify(result), /PRIVATE_OQS_SHARED_SECRET_NOT_SERIALIZABLE/);
  assert.throws(() => JSON.stringify({result}), /PRIVATE_OQS_SHARED_SECRET_NOT_SERIALIZABLE/);
  assert.throws(() => JSON.stringify([result]), /PRIVATE_OQS_SHARED_SECRET_NOT_SERIALIZABLE/);
  result.dispose(); result.dispose();
  assert.equal(owned.every(byte => byte === 0), true);
  assert.equal(fixtureSecret.every(byte => byte === 0xa5), true);
  assert.throws(() => result.shared_secret, /OQS_SHARED_SECRET_DISPOSED/);
  assert.match(inspect(result), /disposed: true/);
  fixtureSecret.fill(0);
  assert.throws(() => new OqsEncapsulation({ciphertext:Buffer.alloc(1567), sharedSecret:Buffer.alloc(32)}), /invalid laboratory ciphertext/);
  assert.throws(() => new OqsEncapsulation({ciphertext:Buffer.alloc(1568), sharedSecret:Buffer.alloc(31)}), /invalid laboratory shared secret/);
});
