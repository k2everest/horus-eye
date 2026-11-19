import {parseArgs} from 'node:util';import {mkdtempSync,mkdirSync,rmSync,statSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
import {OpenChain} from '../services/open-chain/chain.mjs';import {MAX_TARGET} from '../services/open-chain/consensus.mjs';
import {MAX_AEGIS} from '../services/open-chain/queer-units.mjs';import {defaultStarkBackend} from '../services/proof-engine/backend.mjs';
import {assertFreeSpace} from '../services/recovery/disk-space.mjs';

const {values:v}=parseArgs({options:{blocks:{type:'string'},report:{type:'string'}}});
const blocks=Number(v.blocks);if(!v.report||!Number.isSafeInteger(blocks)||blocks<5||blocks>100000)throw Error('EXPLICIT_HISTORY_BUDGET_REQUIRED');
const root=mkdtempSync(join(tmpdir(),'aegis-history-capacity-'));let chain;
try{
 // Conservative preflight, not a reservation or guarantee against disk exhaustion.
 assertFreeSpace(root,blocks*2048);
 const backend=defaultStarkBackend(),config={schema:'AEGIS_OPEN_POW_V3',network_id:'queer-capacity-lab',program_id:backend.programId,genesis_time_ms:Date.now()-(blocks+10)*1000,
  pow_limit:MAX_TARGET.toString(16).padStart(64,'0'),target_spacing_ms:1000,retarget_interval:4,confirmations:2,coinbase_maturity:2,anchor_window:16,
  difficulty:{policy:'supply-quadratic-v1',minimum_target:(MAX_TARGET-1n).toString(16).padStart(64,'0')},
  monetary:{asset_id:'QUEER',base_reward:Number(MAX_AEGIS/3n),max_supply:MAX_AEGIS.toString(),fee_policy:'miner-fees-v1',minimum_fee:1}};
 const limits={maxBlocks:blocks,maxBytes:blocks*2048,maxCacheBytes:1024*1024};
 chain=await OpenChain.open({directory:root,config,backend,limits});
 let rss=process.memoryUsage().rss;const began=performance.now();
 for(let height=1;height<=blocks;height++){
  await chain.mine({ownerTag:'03'.repeat(32),timestamp:config.genesis_time_ms+height*1000});
  if(height%1000===0){rss=Math.max(rss,process.memoryUsage().rss);console.log(JSON.stringify({event:'capacity_progress',height,elapsed_ms:Math.round(performance.now()-began)}));}
 }
 rss=Math.max(rss,process.memoryUsage().rss);const miningMs=Math.round(performance.now()-began),tip=chain.tip,resources=chain.status().resources;
 assert.equal(tip.height,blocks);assert.equal(tip.commitment_count,3);assert.equal(chain.status().protocol_minted_supply,MAX_AEGIS.toString());
 await assert.rejects(chain.mine({ownerTag:'03'.repeat(32),timestamp:config.genesis_time_ms+(blocks+1)*1000}),/POW_STORAGE_CAPACITY/);assert.deepEqual(chain.tip,tip);
 chain.close();chain=undefined;
 const recoveryBegan=performance.now();chain=await OpenChain.open({directory:root,config,backend,limits});assert.deepEqual(chain.tip,tip);
 const recoveryMs=Math.round(performance.now()-recoveryBegan);chain.close();chain=undefined;
 const repository=fileURLToPath(new URL('../../',import.meta.url));let commit=null,dirty=null;try{const git=args=>execFileSync('git',args,{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();commit=git(['rev-parse','HEAD']);dirty=git(['status','--porcelain']).length>0;}catch{}
 const report={schema:'AEGIS_POW_HISTORY_CAPACITY_V1',source_commit:commit,working_tree_dirty:dirty,script_sha256:crypto.createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),node:process.version,scope:'reward-only-chain-storage-and-replay',blocks,
  beyond_default_block_limit:blocks>50000,mining_elapsed_ms:miningMs,replay_elapsed_ms:recoveryMs,sampled_peak_process_rss_bytes:rss,
  sqlite_bytes_after_close:statSync(join(root,'chain.sqlite')).size,resources,tip,financial_transactions_verified:0,
  unspent_commitments:3,real_pow_hashing:true,test_difficulty_floor:'pow_limit-minus-one',native_verifier_available:backend.availableForVerification(),
  lifetime_leaf_capacity_closed:false,public_testnet:false,production_ready:false,outcome:'VERIFIED'};
 const path=resolve(v.report);mkdirSync(dirname(path),{recursive:true,mode:0o700});writeFileSync(path,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
}finally{chain?.close();rmSync(root,{recursive:true,force:true});}
