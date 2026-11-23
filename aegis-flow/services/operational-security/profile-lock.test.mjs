import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {once} from 'node:events';
import {acquireProfileLock} from './profile-lock.mjs';
test('kernel profile lease excludes concurrent owners and is reacquired after release',async t=>{
 const root=mkdtempSync(join(tmpdir(),'profile-lock-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'profile.lock');
 const release=await acquireProfileLock(path);await assert.rejects(acquireProfileLock(path),/ALREADY_IN_USE/);await release();const again=await acquireProfileLock(path);await again();
});
test('crashed parent releases the kernel lease without unsafe stale-file removal',async t=>{
 const root=mkdtempSync(join(tmpdir(),'profile-crash-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const path=join(root,'profile.lock');
 const module=new URL('./profile-lock.mjs',import.meta.url).href;
 const code=`import {acquireProfileLock} from ${JSON.stringify(module)};await acquireProfileLock(${JSON.stringify(path)});console.log('READY');setInterval(()=>{},1000);`;
 const child=spawn(process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe']});t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 await once(child.stdout,'data');child.kill('SIGKILL');await once(child,'exit');
 let release;for(let i=0;i<20&&!release;i++){try{release=await acquireProfileLock(path);}catch(e){if(!/ALREADY_IN_USE/.test(e.message))throw e;await new Promise(r=>setTimeout(r,10));}}
 assert.ok(release);await release();
});
