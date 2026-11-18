import {acquireProfileLock} from '../services/operational-security/profile-lock.mjs';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {readFileSync,writeFileSync} from 'node:fs';
import {OpenChain} from '../services/open-chain/chain.mjs';
import {assertOpenGenesis,openNetworkId} from '../services/open-chain/consensus.mjs';
import {syncPeer,publicRequest,peerOrigin,miningCandidate} from '../services/open-chain/network.mjs';
import {defaultStarkBackend} from '../services/proof-engine/backend.mjs';
import {assertDemoRuntime} from '../services/validation-gateway/runtime-policy.mjs';

assertDemoRuntime();
const {positionals,values}=parseArgs({allowPositionals:true,options:{genesis:{type:'string'},directory:{type:'string'},peer:{type:'string'},owner:{type:'string'},count:{type:'string',default:'1'},output:{type:'string'}}});
const [command]=positionals;
if(command==='lab-genesis'){
 if(!values.output)throw new Error('--output required (will not overwrite)');
 const config=assertOpenGenesis({schema:'AEGIS_OPEN_POW_V2',network_id:'aegis-open-lab',program_id:defaultStarkBackend().programId,
  genesis_time_ms:Date.now(),pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:6,coinbase_maturity:6,anchor_window:128,
  monetary:{asset_id:'AEGIS_LAB',base_reward:7,max_supply:'700000'}});
 writeFileSync(values.output,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({config_id:openNetworkId(config),test_units_only:true,production_ready:false}));
}else if(['status','sync','mine'].includes(command)){
 if(!values.genesis||!values.directory)throw new Error('--genesis and --directory required');
 mkdirSync(values.directory,{recursive:true,mode:0o700});const release=await acquireProfileLock(join(values.directory,'process.lock'));let chain;
 try{chain=await OpenChain.open({config:JSON.parse(readFileSync(values.genesis,'utf8')),directory:values.directory,limits:process.env.AEGIS_POW_LIMITS?JSON.parse(process.env.AEGIS_POW_LIMITS):{}});
  if(values.peer){peerOrigin(values.peer);let result;do{result=await syncPeer(chain,values.peer);}while(result.imported===16);}
  if(command==='sync'&&!values.peer)throw new Error('--peer required');
  if(command==='mine'){
   if(!values.owner||!/^[0-9a-f]{64}$/.test(values.owner))throw new Error('--owner must be the recipient public owner_tag (never a spend secret)');
   const count=Number(values.count);if(!Number.isSafeInteger(count)||count<1||count>100)throw new Error('--count must be 1..100');
   for(let i=0;i<count;i++){
    if(values.peer)await syncPeer(chain,values.peer);
    const candidate=miningCandidate(values.peer?await publicRequest(values.peer,'/mempool/next'):null);
    const block=await chain.mine({transaction:candidate.transaction,proof:candidate.proof,ownerTag:values.owner});
    if(values.peer)await publicRequest(values.peer,'/p2p/block',{block});
    console.log(JSON.stringify({height:block.header.height,tip:chain.tip.hash,production_ready:false}));
   }
  }else console.log(JSON.stringify(chain.status(),null,2));
 }finally{chain?.close();await release();}
}else throw new Error('Usage: open-chain.mjs lab-genesis --output FILE | status|sync|mine --genesis FILE --directory DIR [--peer ORIGIN] [--owner PUBLIC_OWNER_TAG --count N]');
