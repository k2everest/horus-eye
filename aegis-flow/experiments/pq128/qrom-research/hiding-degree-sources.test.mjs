import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditHidingDegreeSources} from './hiding-degree-sources.mjs';

test('absent source locations and missing files remain explicit failures',()=>{
 const empty=auditHidingDegreeSources();
 assert.equal(empty.source_profile_verified,false);
 assert.ok(empty.checks.length>=10);assert.ok(empty.checks.every(c=>c.status==='not-located'));
 const directory=mkdtempSync(join(tmpdir(),'aegis-degree-missing-'));
 try{
  const missing=auditHidingDegreeSources({sourceRoot:directory});
  assert.equal(missing.source_profile_verified,false);assert.ok(missing.checks.every(c=>c.status==='unavailable'));
  for(const k of ['committed_polynomial_degrees_verified','pq128_demonstrated','production_ready'])assert.equal(missing[k],false);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('altered source bytes are mismatches, not evidence derived from file names',()=>{
 const directory=mkdtempSync(join(tmpdir(),'aegis-degree-mismatch-'));
 try{
  mkdirSync(join(directory,'fri/src'),{recursive:true});
  writeFileSync(join(directory,'fri/src/hiding_pcs.rs'),'// forged degree claims\n');
  const result=auditHidingDegreeSources({sourceRoot:directory});
  const check=result.checks.find(c=>c.package==='p3-fri'&&c.path==='src/hiding_pcs.rs');
  assert.equal(check.status,'mismatch');assert.notEqual(check.actual_sha256,check.expected_sha256);
  assert.equal(result.source_profile_verified,false);assert.ok(Object.isFrozen(result.checks));assert.ok(Object.isFrozen(check));
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('cargo metadata resolves exact version locations without accepting duplicate identities',()=>{
 const directory=mkdtempSync(join(tmpdir(),'aegis-degree-metadata-'));
 try{
  const entries=['p3-fri','p3-batch-stark','p3-uni-stark','p3-air','p3-commit'].map(name=>({name,version:'0.8.0',manifest_path:join(directory,name,'Cargo.toml')}));
  const result=auditHidingDegreeSources({cargoMetadata:{packages:entries}});
  assert.equal(result.source_profile_verified,false);assert.ok(result.checks.every(c=>c.status==='unavailable'));
  assert.throws(()=>auditHidingDegreeSources({cargoMetadata:{packages:[...entries,entries[0]]}}),/duplicate/);
  const wrong=auditHidingDegreeSources({cargoMetadata:{packages:entries.map(x=>({...x,version:'0.9.0'}))}});
  assert.ok(wrong.checks.every(c=>c.status==='not-located'));
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('caller booleans, mixed locations and malformed metadata cannot substitute for sources',()=>{
 for(const options of [null,[],{verified:true},{sourceRoot:'/tmp',cargoMetadata:{packages:[]}},
  {sourceRoot:''},{sourceRoot:'\0'},{cargoMetadata:{}},{cargoMetadata:{packages:'not packages'}},
  {cargoMetadata:{packages:[{name:'p3-fri',version:'0.8.0',manifest_path:'relative/Cargo.toml'}]}}])
  assert.throws(()=>auditHidingDegreeSources(options));
});
