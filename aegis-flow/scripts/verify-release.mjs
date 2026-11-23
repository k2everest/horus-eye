import { execFileSync } from 'node:child_process';
import { verifyReleaseBundle } from '../services/recovery/release.mjs';
const [directory,expectedCommit]=process.argv.slice(2);
if(!directory||!expectedCommit)throw new Error('Usage: verify-release.mjs RELEASE_DIRECTORY TRUSTED_SOURCE_COMMIT');
const release=verifyReleaseBundle(directory,expectedCommit);
const image=JSON.parse(execFileSync('docker',['image','inspect',release.image_ref],{encoding:'utf8'}))[0];
if(image.Id!==release.image_id||image.Config.Labels?.['org.opencontainers.image.revision']!==expectedCommit||image.Os!=='linux'||image.Architecture!=='amd64')throw new Error('LOADED_IMAGE_MISMATCH');
console.log(JSON.stringify({verified:true,image_id:image.Id,source_commit:expectedCommit,production_ready:false}));
