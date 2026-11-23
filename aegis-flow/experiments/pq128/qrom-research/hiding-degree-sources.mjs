// Read-only exact-source audit. Both locations and the inventory are trusted
// local build inputs, never values supplied in a network proof or receipt.
import {readFileSync,statSync} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const profile=JSON.parse(readFileSync(new URL('./hiding-degree-sources.json',import.meta.url),'utf8'));
const COMMIT='a21e3ed42905040ad49c519e402f018381c12d0c';
const packages=new Set(['p3-fri','p3-batch-stark','p3-uni-stark','p3-air','p3-commit']);
const pathValid=p=>typeof p==='string'&&p.length<512&&/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.rs$/.test(p);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
if(profile.schema!=='AEGIS_HIDING_DEGREE_SOURCE_PROFILE_V1'||profile.upstream_commit!==COMMIT||
 !Array.isArray(profile.sources)||profile.sources.length<10||profile.sources.length>32||
 new Set(profile.sources.map(s=>`${s.package}/${s.path}`)).size!==profile.sources.length||
 profile.sources.some(s=>!exact(s,'checkout_path,package,path,sha256,version')||!packages.has(s.package)||
 s.version!=='0.8.0'||!pathValid(s.path)||!s.path.startsWith('src/')||
 s.checkout_path!==`${s.package.slice(3)}/${s.path}`||!/^[0-9a-f]{64}$/.test(s.sha256)))
 throw new Error('INVALID_HIDING_DEGREE_SOURCE_PROFILE');

function metadataRoots(metadata){
 if(!metadata||typeof metadata!=='object'||Array.isArray(metadata)||!Array.isArray(metadata.packages)||metadata.packages.length>20000)
  throw new TypeError('bounded cargo metadata packages required');
 const roots=new Map();
 for(const entry of metadata.packages){
  if(!entry||typeof entry!=='object'||!packages.has(entry.name)||entry.version!=='0.8.0')continue;
  if(roots.has(entry.name))throw new TypeError('duplicate pinned cargo package');
  const path=entry.manifest_path;
  if(typeof path!=='string'||path.length>4096||path.includes('\0')||!isAbsolute(path)||!path.endsWith('/Cargo.toml'))
   throw new TypeError('absolute pinned cargo manifest path required');
  roots.set(entry.name,dirname(path));
 }
 return roots;
}

export function auditHidingDegreeSources(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||
  Object.keys(options).some(k=>!['sourceRoot','cargoMetadata'].includes(k)))throw new TypeError('source audit options required');
 const {sourceRoot,cargoMetadata}=options;
 if(sourceRoot!==undefined&&cargoMetadata!==undefined)throw new TypeError('select exactly one trusted source location');
 let checkout,roots;
 if(sourceRoot!==undefined){
  if(typeof sourceRoot!=='string'||!sourceRoot.length||sourceRoot.length>4096||sourceRoot.includes('\0'))
   throw new TypeError('bounded local source root required');
  checkout=resolve(sourceRoot);
 }else if(cargoMetadata!==undefined)roots=metadataRoots(cargoMetadata);
 const checks=profile.sources.map(source=>{
  const location=checkout?join(checkout,source.checkout_path):roots?.has(source.package)?join(roots.get(source.package),source.path):null;
  let actual=null,status=location?'unavailable':'not-located';
  if(location){
   try{
    const info=statSync(location);
    if(!info.isFile()||info.size<1||info.size>2*1024*1024)throw new Error('source size');
    const bytes=readFileSync(location);
    if(bytes.length!==info.size||bytes.length>2*1024*1024)throw new Error('source changed');
    actual=createHash('sha256').update(bytes).digest('hex');
    status=actual===source.sha256?'match':'mismatch';
   }catch{/* Unavailable or invalid local source is never a skipped success. */}
  }
  return Object.freeze({package:source.package,version:source.version,path:source.path,
   expected_sha256:source.sha256,actual_sha256:actual,status});
 });
 return Object.freeze({schema:'AEGIS_HIDING_DEGREE_SOURCE_AUDIT_V1',upstream_commit:COMMIT,
  source_location:checkout?'trusted-checkout':roots?'trusted-cargo-metadata':'none',
  source_profile_verified:checks.every(c=>c.status==='match'),checks:Object.freeze(checks),
  scope:'exact-source-identity-only; not committed-polynomial degree verification or source-to-binary attestation',
  committed_polynomial_degrees_verified:false,pq128_demonstrated:false,production_ready:false});
}
