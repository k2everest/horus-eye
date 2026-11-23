import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyReleaseBundle} from './release.mjs';
test('release binds immutable image, source commit and compose; floating refs fail',t=>{
 const dir=mkdtempSync(join(tmpdir(),'aegis-release-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const compose='services: {}\n';
 writeFileSync(join(dir,'compose.yaml'),compose);
 const release={schema:'AEGIS_SINGLE_HOST_RELEASE_V1',kind:'LAB_STAGING_ONLY',ledger_schema:3,program_id:'56'.repeat(32),verifier_sha256:'78'.repeat(32),source_commit:'ab'.repeat(20),image_id:'sha256:'+'12'.repeat(32),image_ref:'sha256:'+'12'.repeat(32),compose_sha256:crypto.createHash('sha256').update(compose).digest('hex'),single_host:true,replicas:1,production_ready:false};
 const save=()=>writeFileSync(join(dir,'release.json'),JSON.stringify(release));save();assert.equal(verifyReleaseBundle(dir,release.source_commit).replicas,1);
 release.image_ref='aegis:latest';save();assert.throws(()=>verifyReleaseBundle(dir,release.source_commit),/MISMATCH/);
 release.image_ref=release.image_id;save();writeFileSync(join(dir,'compose.yaml'),'altered');assert.throws(()=>verifyReleaseBundle(dir,release.source_commit),/MISMATCH/);
});
