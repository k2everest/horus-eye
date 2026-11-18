import crypto from 'node:crypto';
import {canonicalSerialize,buildTranscriptHash} from '../../libs/crypto-core/canonical-transcript.mjs';
import {merkleRoot} from '../../libs/crypto-core/merkle-proof.mjs';
import {assertNoteV2,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
export const POW_SCHEMA='AEGIS_OPEN_POW_V2';
export const MAX_TARGET=(1n<<248n)-1n;
export const ZERO_HASH='0'.repeat(64);
const hex=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export const digest=(domain,payload)=>buildTranscriptHash({domainTag:domain,payload});
export const EMPTY_NULLIFIERS=digest('AEGIS_POW_NULLIFIERS_V1',[]);
export function assertOpenGenesis(config){
 if(!exact(config,['schema','network_id','program_id','genesis_time_ms','pow_limit','target_spacing_ms','retarget_interval','confirmations','coinbase_maturity','anchor_window','monetary'])||config.schema!==POW_SCHEMA||
  typeof config.network_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(config.network_id)||!hex(config.program_id)||!hex(config.pow_limit)||BigInt('0x'+config.pow_limit)<1n||BigInt('0x'+config.pow_limit)>MAX_TARGET||
  !Number.isSafeInteger(config.genesis_time_ms)||config.genesis_time_ms<0)throw new Error('INVALID_OPEN_GENESIS');
 for(const [key,min,max]of [['target_spacing_ms',1000,3600000],['retarget_interval',4,4096],['confirmations',2,100],['coinbase_maturity',2,100],['anchor_window',16,4096]])
  if(!Number.isSafeInteger(config[key])||config[key]<min||config[key]>max)throw new Error('INVALID_POW_PARAMETER');
 const m=config.monetary;
 if(!(exact(m,['asset_id','base_reward','max_supply'])||exact(m,['asset_id','base_reward','max_supply','fee_policy','minimum_fee']))||typeof m.asset_id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(m.asset_id)||!Number.isSafeInteger(m.base_reward)||m.base_reward<1||
  typeof m.max_supply!=='string'||!/^[1-9][0-9]{0,19}$/.test(m.max_supply)||BigInt(m.max_supply)>((1n<<64n)-1n)||BigInt(m.max_supply)<BigInt(m.base_reward))throw new Error('INVALID_POW_MONETARY_RULE');
 if(Object.hasOwn(m,'fee_policy')&&(m.fee_policy!=='miner-fees-v1'||!Number.isSafeInteger(m.minimum_fee)||m.minimum_fee<1||BigInt(m.minimum_fee)+BigInt(m.base_reward)>BigInt(Number.MAX_SAFE_INTEGER)))throw new Error('INVALID_POW_FEE_POLICY');
 return config;
}
export function openNetworkId(config){assertOpenGenesis(config);return digest('AEGIS_OPEN_POW_GENESIS_V2',config);}
export function genesisTip(config){return{height:0,hash:openNetworkId(config),work:'0',note_root:merkleRoot([]),nullifier_root:EMPTY_NULLIFIERS,commitment_count:0,timestamp_ms:config.genesis_time_ms};}
export function subsidy(config,height){
 if(!Number.isSafeInteger(height)||height<1)throw new Error('INVALID_POW_HEIGHT');
 const remaining=BigInt(config.monetary.max_supply)-BigInt(height-1)*BigInt(config.monetary.base_reward);
 return remaining<=0n?0:Number(remaining<BigInt(config.monetary.base_reward)?remaining:BigInt(config.monetary.base_reward));
}
export function minimumTransactionFee(config){return config.monetary.fee_policy==='miner-fees-v1'?config.monetary.minimum_fee:0;}
export function transactionFee(config,transaction){
 if(transaction===null)return 0;
 const fee=transaction?.public_amount;
 if(!Number.isSafeInteger(fee)||fee<minimumTransactionFee(config)||(config.monetary.fee_policy!=='miner-fees-v1'&&fee!==0))throw Error('INVALID_POW_TRANSACTION_FEE');
 return fee;
}
export function minerReward(config,height,transaction=null){
 const reward=BigInt(subsidy(config,height))+BigInt(transactionFee(config,transaction));
 if(reward>BigInt(Number.MAX_SAFE_INTEGER))throw Error('POW_MINER_REWARD_OVERFLOW');
 return Number(reward);
}
export function blockHash(header){const first=crypto.createHash('sha256').update('AEGIS_POW_BLOCK_V2\0').update(canonicalSerialize(header)).digest();return crypto.createHash('sha256').update(first).digest('hex');}
export function blockWork(target){return(1n<<256n)/(BigInt('0x'+target)+1n);}
export function expectedTarget(config,ancestors){
 const height=ancestors.length?ancestors.at(-1).header.height+1:1;
 if(height===1)return config.pow_limit;
 const previous=ancestors.at(-1).header;
 if((height-1)%config.retarget_interval!==0)return previous.target;
 const first=ancestors[ancestors.length-config.retarget_interval].header;
 const expected=BigInt(config.target_spacing_ms*(config.retarget_interval-1));
 const elapsed=BigInt(Math.max(1,previous.timestamp_ms-first.timestamp_ms));
 const span=elapsed<expected/4n?expected/4n:elapsed>expected*4n?expected*4n:elapsed;
 let target=BigInt('0x'+previous.target)*span/expected;
 if(target<1n)target=1n;if(target>BigInt('0x'+config.pow_limit))target=BigInt('0x'+config.pow_limit);
 return target.toString(16).padStart(64,'0');
}
export function medianTime(config,ancestors){const values=ancestors.slice(-11).map(b=>b.header.timestamp_ms);if(!values.length)return config.genesis_time_ms;values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)];}
export function assertBlockHeader(config,block,ancestors,{now=Date.now()}={}){
 if(!exact(block,['header','transaction','proof','reward'])||!exact(block.header,['version','network','height','parent','timestamp_ms','target','nonce','body_hash','note_root','nullifier_root','commitment_count']))throw new Error('INVALID_POW_BLOCK_SHAPE');
 const h=block.header,parent=ancestors.length?blockHash(ancestors.at(-1).header):openNetworkId(config);
 if(h.version!=='AEGIS_POW_HEADER_V2'||h.network!==openNetworkId(config)||h.height!==(ancestors.length?ancestors.at(-1).header.height+1:1)||h.parent!==parent||
  !Number.isSafeInteger(h.timestamp_ms)||h.timestamp_ms<=medianTime(config,ancestors)||h.timestamp_ms>now+7200000||h.target!==expectedTarget(config,ancestors)||
  ![h.nonce,h.body_hash,h.note_root,h.nullifier_root].every(hex)||!Number.isSafeInteger(h.commitment_count)||h.commitment_count<1||h.commitment_count>1000000||
  h.body_hash!==digest('AEGIS_POW_BODY_V1',{transaction:block.transaction,proof:block.proof,reward:block.reward})||BigInt('0x'+blockHash(h))>BigInt('0x'+h.target))throw new Error('INVALID_POW_HEADER_OR_WORK');
 const reward=minerReward(config,h.height,block.transaction);
 if(reward===0){if(block.reward!==null)throw new Error('UNEXPECTED_COINBASE');}
 else{assertNoteV2(block.reward);if(block.reward.asset_id!==config.monetary.asset_id||block.reward.value!==reward)throw new Error('INVALID_PROTOCOL_SUBSIDY');noteCommitmentV2(block.reward);}
 if((block.transaction===null)!==(block.proof===null))throw new Error('POW_TRANSACTION_AND_PROOF_REQUIRED');
 return{hash:blockHash(h),work:blockWork(h.target)};
}
export async function mineHeader(header,{maxIterations=5000000,startNonce=0n}={}){
 if(!Number.isSafeInteger(maxIterations)||maxIterations<1||maxIterations>100000000)throw new Error('INVALID_MINING_BUDGET');
 const target=BigInt('0x'+header.target);
 for(let i=0;i<maxIterations;i++){
  const candidate={...header,nonce:(startNonce+BigInt(i)).toString(16).padStart(64,'0')};
  if(candidate.nonce.length>64)throw new Error('NONCE_EXHAUSTED');
  if(BigInt('0x'+blockHash(candidate))<=target)return candidate;
  if(i%4096===4095)await new Promise(resolve=>setImmediate(resolve));
 }
 throw new Error('MINING_BUDGET_EXHAUSTED');
}
