import {mkdirSync,mkdtempSync,existsSync,linkSync,unlinkSync,rmdirSync,rmSync,openSync,closeSync,fsyncSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {OpenChain} from './chain.mjs';
import {openNetworkId} from './consensus.mjs';
import {syncPeer,peerOrigin} from './network.mjs';
import {defaultStarkBackend,StarkBackend} from '../proof-engine/backend.mjs';
import {assertFreeSpace} from '../recovery/disk-space.mjs';

const sync=path=>{const fd=openSync(path,'r');try{fsyncSync(fd);}finally{closeSync(fd);}};
// Rebuild from public blocks; never import a peer's claimed state/database.
export async function recoverFromPeers({destinationDirectory,config,peers,minimumWork,maxBlocks=50000,maxRounds=1024,timeoutMs=3600000,backend=defaultStarkBackend(),limits}) {
 if(typeof minimumWork!=='string'||! /^[1-9][0-9]{0,127}$/.test(minimumWork))throw Error('INDEPENDENT_POSITIVE_WORK_FLOOR_REQUIRED');
 if(!Array.isArray(peers)||peers.length<1||peers.length>16)throw Error('RECOVERY_PEERS_REQUIRED');
 peers=[...new Set(peers.map(peerOrigin))];
 for(const [value,max] of [[maxBlocks,10000000],[maxRounds,10000],[timeoutMs,86400000]])if(!Number.isSafeInteger(value)||value<1||value>max)throw Error('INVALID_RECOVERY_BUDGET');
 const configId=openNetworkId(config),destination=resolve(destinationDirectory),parent=dirname(destination);
 if(existsSync(destination))throw Error('RECOVERY_DESTINATION_EXISTS');
 mkdirSync(parent,{recursive:true,mode:0o700});assertFreeSpace(parent,0);
 const staging=mkdtempSync(join(parent,'.pow-peer-recovery-')),began=performance.now();
 const deadline=AbortSignal.timeout(timeoutMs);
 const report={schema:'AEGIS_POW_PEER_RECOVERY_V1',config_id:configId,started_at:Date.now(),minimum_work:minimumWork,
  native_stark_backend:backend instanceof StarkBackend,peer_operator_independence_verified:false,peer_attempts:[],imported_blocks:0,
  state_source:'locally-verified-public-blocks',wallet_keys_recovered:false,external_storage_required:false,production_ready:false};
 let chain,created=false,linked=false,success=false;
 try {
  chain=await OpenChain.open({directory:staging,config,backend,limits});
  for(let round=0;round<maxRounds;round++) {
   let progress=0;
   for(const peer of peers) {
    if(report.imported_blocks>=maxBlocks)break;
    assertFreeSpace(staging,0);
    const beforeBatch=report.imported_blocks;
    try {
     await syncPeer(chain,peer,{signal:deadline,maxBlocks:Math.min(64,maxBlocks-report.imported_blocks),onBlockValidated:()=>{progress++;report.imported_blocks++;}});
     // Keep bounded diagnostics even in a long-running recovery.
     const prior=report.peer_attempts.find(p=>p.origin===peer);
     if(prior){prior.successful_batches++;prior.imported_blocks+=report.imported_blocks-beforeBatch;}
     else report.peer_attempts.push({origin:peer,successful_batches:1,imported_blocks:report.imported_blocks-beforeBatch,failures:0});
    } catch(error) {
     if(deadline.aborted)throw Error('PEER_RECOVERY_TIMEOUT');
     let prior=report.peer_attempts.find(p=>p.origin===peer);
     if(!prior){prior={origin:peer,successful_batches:0,imported_blocks:0,failures:0};report.peer_attempts.push(prior);}
     prior.imported_blocks+=report.imported_blocks-beforeBatch;prior.failures++;prior.last_error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PEER_RECOVERY_FAILED';
    }
   }
   if(BigInt(chain.tip.work)>=BigInt(minimumWork))break;
   if(!progress||report.imported_blocks>=maxBlocks)break;
  }
  report.tip=chain.tip;report.resources=chain.status().resources;
  if(BigInt(chain.tip.work)<BigInt(minimumWork))throw Error('POW_RECOVERY_BELOW_VERIFIED_WORK');
  chain.close();chain=undefined;
  const file=join(staging,'chain.sqlite');sync(file);
  mkdirSync(destination,{mode:0o700});created=true;
  linkSync(file,join(destination,'chain.sqlite'));linked=true;sync(destination);sync(parent);
  success=true;report.outcome='VERIFIED';
 } catch(error) {report.outcome='FAILED';report.failure_code=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PEER_RECOVERY_FAILED';}
 finally {
  chain?.close();rmSync(staging,{recursive:true,force:true});
  if(created&&!success){if(linked)unlinkSync(join(destination,'chain.sqlite'));try{rmdirSync(destination);}catch{}}
 }
 report.finished_at=Date.now();report.recovery_elapsed_ms=Math.round(performance.now()-began);
 report.rpo_measured=false;report.evidence_accepted=false;
 return{destination,report};
}
