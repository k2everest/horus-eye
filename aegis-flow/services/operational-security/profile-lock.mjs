import {spawn} from 'node:child_process';
import {openSync,closeSync,readFileSync,writeFileSync,constants,fstatSync} from 'node:fs';
import {resolve} from 'node:path';

// Closing the parent's pipe, including after a crash, releases the kernel lease.
export async function acquireProfileLock(filename){
 filename=resolve(filename);const fd=openSync(filename,constants.O_CREAT|constants.O_APPEND|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
 try{const stat=fstatSync(fd);if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('PROFILE_LOCK_REQUIRES_MODE_0600');}finally{closeSync(fd);}
 const child=spawn('flock',['--exclusive','--nonblock','--no-fork',filename,'sh','-c','printf "AEGIS_PROFILE_LOCKED\\n"; exec cat >/dev/null'],{stdio:['pipe','pipe','pipe']});
 let acquired=false,exited=false,released=false;const exit=new Promise(resolve=>{child.once('exit',()=>{exited=true;if(acquired&&!released){process.stderr.write('PROFILE_LOCK_LOST\n');process.exit(70);}resolve();});child.once('error',()=>{exited=true;resolve();});});
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('PROFILE_LOCK_TIMEOUT'));},5000);
   const done=error=>{clearTimeout(timeout);if(error)reject(error);else resolve();};
   child.once('error',()=>done(Error('FLOCK_REQUIRED_FOR_PROFILE_LOCK')));child.once('exit',()=>{if(!acquired)done(Error('PROFILE_ALREADY_IN_USE'));});
   child.stdout.once('data',chunk=>{if(chunk.toString()!=='AEGIS_PROFILE_LOCKED\n')done(Error('PROFILE_LOCK_PROTOCOL'));else{acquired=true;done();}});
  });
  const previous=readFileSync(filename,'utf8').trim();
  if(/^[1-9][0-9]*$/.test(previous)&&Number(previous)!==process.pid){
   try{process.kill(Number(previous),0);throw Error('LEGACY_PROFILE_PROCESS_STILL_RUNNING');}catch(e){if(e.code!=='ESRCH')throw e;}
  }
  writeFileSync(filename,JSON.stringify({schema:'AEGIS_KERNEL_LEASE_V1',pid:process.pid}),{mode:0o600});
 }catch(e){released=true;child.stdin.destroy();if(!exited)child.kill('SIGTERM');await exit;throw e;}
 return async()=>{if(released)return;released=true;try{writeFileSync(filename,'',{mode:0o600});}finally{child.stdin.end();await exit;}};
}
