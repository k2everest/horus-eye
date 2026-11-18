import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=fileURLToPath(new URL('../',import.meta.url));
function fixture(t,{schemas=true}={}) {
  const root=mkdtempSync(join(tmpdir(),'aegis proto-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const base=join(root,'aegis-flow');
  for(const dir of ['scripts','proto/aegis/v1'])mkdirSync(join(base,dir),{recursive:true});
  const schemasToCopy=()=>{for(const name of ['crypto.proto','tx.proto'])copyFileSync(join(source,'proto/aegis/v1',name),join(base,'proto/aegis/v1',name));};
  for(const name of ['buf.yaml','buf.gen.yaml','scripts/gen-proto.sh'])copyFileSync(join(source,name),join(base,name));
  if(schemas)schemasToCopy();
  const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
  git(['init','-q']);git(['add','.']);git(['-c','user.name=Proto test','-c','user.email=proto@example.invalid','commit','-qm','baseline']);
  const run=(ref='HEAD')=>execFileSync('bash',['scripts/gen-proto.sh','--check'],{cwd:base,encoding:'utf8',env:{...process.env,AEGIS_PROTO_BASE_REF:ref},stdio:'pipe'});
  return{base,schemasToCopy,run};
}
test('first schema introduction compares against a genuinely empty base without a nested Git repository',t=>{
  const f=fixture(t,{schemas:false});f.schemasToCopy();
  assert.match(f.run(),/introduces the initial contract/);
  assert.equal(existsSync(join(f.base,'gen')),false);
});
test('existing schemas compare successfully from a checkout whose path contains spaces',t=>{
  const f=fixture(t);assert.doesNotThrow(()=>f.run());
});
test('a wire-incompatible field type is rejected against the existing base',t=>{
  const f=fixture(t),path=join(f.base,'proto/aegis/v1/tx.proto');
  writeFileSync(path,readFileSync(path,'utf8').replace('string request_id = 2;','int32 request_id = 2;'));
  assert.throws(()=>f.run(),error=>error.status!==0&&/changed type|FIELD_SAME_TYPE/i.test(error.stdout+error.stderr));
});
test('missing base references fail rather than silently disabling compatibility checks',t=>{
  const f=fixture(t);assert.throws(()=>f.run('refs/heads/missing-base'),error=>error.status!==0);
});
