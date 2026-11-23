import {mkdirSync,writeFileSync,rmSync} from 'node:fs';import {join,resolve} from 'node:path';import {performance} from 'node:perf_hooks';import crypto from 'node:crypto';
import {createPowBackup,restorePowBackup} from './recovery.mjs';import {openNetworkId} from './consensus.mjs';
import {defaultStarkBackend,StarkBackend} from '../proof-engine/backend.mjs';
// A successful local report is evidence for review, never release authorization.
export async function runPowS3Drill({chainDirectory,config,backupDirectory,outputDirectory,keyFile,minimumWork,target,backend=defaultStarkBackend(),sourceCommit=null}){
 if(typeof minimumWork!=='string'||!/^(0|[1-9][0-9]{0,127})$/.test(minimumWork))throw Error('INDEPENDENT_POW_WORK_FLOOR_REQUIRED');
 if(sourceCommit!==null&&!/^[0-9a-f]{40}$/.test(sourceCommit))throw Error('INVALID_DRILL_SOURCE_COMMIT');
 mkdirSync(outputDirectory,{recursive:true,mode:0o700});const directory=join(outputDirectory,crypto.randomUUID());mkdirSync(directory,{mode:0o700});
 const started=performance.now(),report={schema:'AEGIS_POW_S3_RESTORE_DRILL_V1',started_at:Date.now(),source_commit:sourceCommit,config_id:openNetworkId(config),program_id:config.program_id,minimum_work:minimumWork,target:target.config,
  external_transport_used:target.transport==='aws-cli',native_stark_backend:backend instanceof StarkBackend,local_restore_verified:false,download_restore_verified:false,evidence_accepted:false,production_ready:false};
 let stage='local-backup';
 try{
  const archive=await createPowBackup({chainDirectory,config,outputDirectory:backupDirectory,keyFile,backend});report.backup_id=archive.manifest.context.backup_id;
  stage='local-restore';const localPath=join(directory,'local-verified');const local=await restorePowBackup({backupDirectory:archive.directory,destinationDirectory:localPath,config,keyFile,minimumWork,backend});report.local_restore_verified=true;rmSync(localPath,{recursive:true});
  stage='upload';const receipt=await target.upload(archive.directory);report.objects=receipt.objects;report.commit_marker=target.lastCommit;
  stage='download';const downloaded=join(directory,'downloaded');await target.download({backupId:receipt.backup_id,destinationDirectory:downloaded,receipt});
  stage='download-restore';const beganRestore=performance.now(),destination=join(directory,'remote-verified');const recovered=await restorePowBackup({backupDirectory:downloaded,destinationDirectory:destination,config,keyFile,minimumWork,backend});
  if(recovered.tip.hash!==local.tip.hash||recovered.tip.work!==local.tip.work||recovered.tip.note_root!==local.tip.note_root||recovered.tip.nullifier_root!==local.tip.nullifier_root)throw Error('DRILL_RESTORED_STATE_MISMATCH');
  report.download_restore_verified=true;report.tip=recovered.tip;report.restore_elapsed_ms=Math.round(performance.now()-beganRestore);report.outcome='VERIFIED';
 }catch(e){report.outcome='FAILED';report.failure_stage=stage;report.failure_code=/^[A-Z0-9_]+$/.test(e.message)?e.message:'DRILL_OPERATION_FAILED';}
 report.finished_at=Date.now();report.elapsed_ms=Math.round(performance.now()-started);
 const path=join(directory,'drill-report.json');writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
 return{directory:resolve(directory),report_file:resolve(path),report};
}
