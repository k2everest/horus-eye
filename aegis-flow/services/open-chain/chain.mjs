import {serialize} from 'node:v8';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
import {createPrivateNote} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {assertOpenGenesis,openNetworkId,genesisTip,blockHash,assertBlockHeader,expectedTarget,medianTime,subsidy,minerReward,minimumTransactionFee,digest,mineHeader} from './consensus.mjs';
import {BranchState} from './state.mjs';
export class OpenChain {
 #db;#config;#nodes=new Map();#best;#backend;#busy=false;#closed=false;#canonical=[];#snapshots=new Map();#cacheBytes=0;#storedBytes=0;#limits;
 constructor({directory,config,backend=defaultStarkBackend(),limits={}}){
  const defaults={maxBlocks:50000,maxBytes:512*1024*1024,maxBlockBytes:12*1024*1024,maxForkBlocks:4096,maxReplayBlocks:1024,maxCacheBytes:256*1024*1024};
  if(Object.keys(limits).some(key=>!Object.hasOwn(defaults,key)))throw new Error('INVALID_POW_RESOURCE_LIMIT');
  this.#limits={...defaults,...limits};
  for(const [key,value] of Object.entries(this.#limits))if(!Number.isSafeInteger(value)||value<1)throw new Error("INVALID_POW_RESOURCE_LIMIT");
  this.#config=structuredClone(assertOpenGenesis(config));this.#backend=backend;
  if(backend.programId!==config.program_id)throw new Error('OPEN_CHAIN_PROGRAM_MISMATCH');
  mkdirSync(directory,{recursive:true,mode:0o700});const filename=join(directory,'chain.sqlite');closeSync(openSync(filename,'a',0o600));chmodSync(filename,0o600);
  this.#db=new DatabaseSync(filename);this.#db.exec('PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000;PRAGMA trusted_schema=OFF;');
  this.#db.exec('CREATE TABLE IF NOT EXISTS network(config_id TEXT PRIMARY KEY,config_json TEXT NOT NULL) STRICT;CREATE TABLE IF NOT EXISTS pow_blocks(hash TEXT PRIMARY KEY,parent TEXT NOT NULL,height INTEGER NOT NULL,work TEXT NOT NULL,block_json TEXT NOT NULL) STRICT;');
  if(this.#db.prepare('SELECT COUNT(*) AS n FROM network').get().n>1){this.#db.close();throw new Error('OPEN_CHAIN_GENESIS_IMMUTABLE');}
  const row=this.#db.prepare('SELECT * FROM network').get();
  if(row&&(row.config_id!==openNetworkId(config)||row.config_json!==canonicalSerialize(config))){this.#db.close();throw new Error('OPEN_CHAIN_GENESIS_IMMUTABLE');}
  this.#db.prepare('INSERT OR IGNORE INTO network VALUES(?,?)').run(openNetworkId(config),canonicalSerialize(config));this.#best=genesisTip(config);
 }
 static async open(options){const chain=new OpenChain(options);try{await chain.#recover();return chain;}catch(error){chain.close();throw error;}}
 get config(){return structuredClone(this.#config);}
 get busy(){return this.#busy;}
 get tip(){return{...this.#best};}
 get confirmedHeight(){return Math.max(0,this.#best.height-this.#config.confirmations+1);}
 has(hash){return hash===openNetworkId(this.#config)||this.#nodes.has(hash);}
 #branch(hash,headersOnly=false){const blocks=[];const seen=new Set();while(hash!==openNetworkId(this.#config)){if(seen.has(hash))throw new Error('POW_CHAIN_CYCLE');seen.add(hash);const row=this.#nodes.get(hash);if(!row)throw new Error('POW_UNKNOWN_PARENT');blocks.push(headersOnly?row.block:this.block(hash));hash=row.block.header.parent;}return blocks.reverse();}
 blocks(hash=this.#best.hash){return structuredClone(this.#branch(hash));}
 block(hash){const row=this.#db.prepare('SELECT block_json FROM pow_blocks WHERE hash=?').get(hash);return row?JSON.parse(row.block_json):undefined;}
 blockAt(height){if(!Number.isSafeInteger(height)||height<1)return undefined;const hash=this.#canonical[height-1];return hash?this.block(hash):undefined;}
 hashAt(height){if(height===0)return openNetworkId(this.#config);return this.#canonical[height-1];}
 status(){const confirmed=this.confirmedHeight;const b=confirmed?this.#nodes.get(this.#canonical[confirmed-1]).block.header:undefined;
  return{model:'open-proof-of-work',config_id:openNetworkId(this.#config),network_id:this.#config.network_id,tip:this.tip,resources:{stored_blocks:this.#nodes.size,stored_body_bytes:this.#storedBytes,cached_state_bytes:this.#cacheBytes,limits:{...this.#limits}},
   confirmed:{height:confirmed,checkpoint_id:confirmed?blockHash(b):openNetworkId(this.#config),root:b?.note_root??genesisTip(this.#config).note_root},
   minimum_transaction_fee:minimumTransactionFee(this.#config),fee_policy:this.#config.monetary.fee_policy??'legacy-zero',confirmations_required:this.#config.confirmations,finality:'probabilistic',monetary_authority:null,protocol_minted_supply:(BigInt(this.#best.height)*BigInt(this.#config.monetary.base_reward)>BigInt(this.#config.monetary.max_supply)?BigInt(this.#config.monetary.max_supply):BigInt(this.#best.height)*BigInt(this.#config.monetary.base_reward)).toString(),production_ready:false};
 }
 readiness(){
  const verifier=Boolean(this.#backend.availableForVerification?.());
  const capacity=this.#nodes.size<this.#limits.maxBlocks&&this.#storedBytes+this.#limits.maxBlockBytes<=this.#limits.maxBytes;
  return{ready:!this.#closed&&verifier&&capacity,verifier_available:verifier,storage_capacity:capacity,production_ready:false};
 }
 #remember(hash,state){
  const snapshot=state.snapshot(),bytes=serialize(snapshot).byteLength;if(bytes>this.#limits.maxCacheBytes)throw new Error('POW_STATE_MEMORY_CAPACITY');
  if(this.#snapshots.has(hash)){this.#cacheBytes-=this.#snapshots.get(hash).bytes;this.#snapshots.delete(hash);}
  while(this.#snapshots.size&&this.#cacheBytes+bytes>this.#limits.maxCacheBytes){const key=this.#snapshots.keys().next().value;this.#cacheBytes-=this.#snapshots.get(key).bytes;this.#snapshots.delete(key);}
  this.#snapshots.set(hash,{snapshot,bytes});this.#cacheBytes+=bytes;
 }
 async #stateAt(hash){
  const suffix=[];let cursor=hash;
  while(cursor!==openNetworkId(this.#config)&&!this.#snapshots.has(cursor)){
   if(suffix.length>=this.#limits.maxReplayBlocks)throw new Error('POW_REPLAY_BUDGET_EXCEEDED');
   const row=this.#nodes.get(cursor);if(!row)throw new Error('POW_UNKNOWN_PARENT');suffix.push(cursor);cursor=row.block.header.parent;
  }
  const cached=this.#snapshots.get(cursor);const state=new BranchState(this.#config,this.#backend,cached?.snapshot);
  if(cached){this.#snapshots.delete(cursor);this.#snapshots.set(cursor,cached);}
  for(const id of suffix.reverse()){const b=this.block(id);await state.applyBody(b,b.header.height);
   if(state.noteRoot!==b.header.note_root||state.nullifierRoot!==b.header.nullifier_root||state.count!==b.header.commitment_count)throw new Error('POW_STATE_ROOT_MISMATCH');}
  return state;
 }
 async withState(operation,hash=this.#best.hash){return operation(await this.#stateAt(hash));}
 #recentAncestors(hash){
  const blocks=[],genesis=openNetworkId(this.#config),window=Math.max(11,this.#config.retarget_interval);
  while(hash!==genesis&&blocks.length<window){const row=this.#nodes.get(hash);if(!row)throw Error('POW_UNKNOWN_PARENT');blocks.push(row.block);hash=row.block.header.parent;}
  return blocks.reverse();
 }
 async #check(block){const parents=this.#recentAncestors(block.header.parent);const checked=assertBlockHeader(this.#config,block,parents);
  const state=await this.#stateAt(block.header.parent);await state.applyBody(block,block.header.height);
  if(state.noteRoot!==block.header.note_root||state.nullifierRoot!==block.header.nullifier_root||state.count!==block.header.commitment_count)throw new Error('POW_STATE_ROOT_MISMATCH');
  if(serialize(state.snapshot()).byteLength>this.#limits.maxCacheBytes)throw new Error('POW_STATE_MEMORY_CAPACITY');
  const parent=this.#nodes.get(block.header.parent);return{hash:checked.hash,work:((parent?BigInt(parent.work):0n)+checked.work).toString(),block,state};
 }
 #reserve(bytes,parent){
  if(this.#nodes.size+1<=this.#limits.maxBlocks&&this.#storedBytes+bytes<=this.#limits.maxBytes&&this.#nodes.size-this.#canonical.length+1<=this.#limits.maxForkBlocks)return;
  const pinned=new Set([...this.#canonical,...this.#branch(parent,true).map(b=>blockHash(b.header))]);
  while(this.#nodes.size+1>this.#limits.maxBlocks||this.#storedBytes+bytes>this.#limits.maxBytes||this.#nodes.size-this.#canonical.length+1>this.#limits.maxForkBlocks){
   const parents=new Set([...this.#nodes.values()].map(r=>r.block.header.parent));
   const candidates=[...this.#nodes.values()].filter(r=>!pinned.has(r.hash)&&!parents.has(r.hash)).sort((a,b)=>BigInt(a.work)<BigInt(b.work)?-1:1);
   const row=candidates[0];if(!row)throw new Error('POW_STORAGE_CAPACITY');
   this.#db.prepare('DELETE FROM pow_blocks WHERE hash=?').run(row.hash);this.#nodes.delete(row.hash);this.#storedBytes-=row.bytes;
   if(this.#snapshots.has(row.hash)){this.#cacheBytes-=this.#snapshots.get(row.hash).bytes;this.#snapshots.delete(row.hash);}
  }
 }
 #storeRow(row,bytes){this.#nodes.set(row.hash,{hash:row.hash,work:row.work,block:{header:structuredClone(row.block.header),transaction:row.block.transaction?{tx_id:row.block.transaction.tx_id,request_id:row.block.transaction.request_id}:null},bytes});this.#storedBytes+=bytes;this.#remember(row.hash,row.state);}
 #consider(row){const better=BigInt(row.work)>BigInt(this.#best.work)||(row.work===this.#best.work&&row.hash<this.#best.hash);
  if(better){const h=row.block.header,extendsBest=h.parent===this.#best.hash;this.#best={hash:row.hash,height:h.height,work:row.work,note_root:h.note_root,nullifier_root:h.nullifier_root,commitment_count:h.commitment_count,timestamp_ms:h.timestamp_ms};if(extendsBest)this.#canonical.push(row.hash);else this.#canonical=this.#branch(row.hash,true).map(b=>blockHash(b.header));}return better;
 }
 async #recover(){if(this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('POW_DATABASE_INTEGRITY_FAILED');
  const size=this.#db.prepare('SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(block_json AS BLOB))),0) AS bytes,COALESCE(MAX(length(CAST(block_json AS BLOB))),0) AS largest FROM pow_blocks').get();
  if(size.n>this.#limits.maxBlocks||size.bytes>this.#limits.maxBytes||size.largest>this.#limits.maxBlockBytes)throw new Error('POW_STORAGE_CAPACITY');
  for(const saved of this.#db.prepare('SELECT * FROM pow_blocks ORDER BY height,hash').iterate()){
   const row=await this.#check(JSON.parse(saved.block_json));if(row.hash!==saved.hash||row.work!==saved.work||row.block.header.parent!==saved.parent||row.block.header.height!==saved.height)throw new Error('POW_DATABASE_REVALIDATION_FAILED');
   this.#storeRow(row,Buffer.byteLength(saved.block_json));this.#consider(row);
  }
 }
 async addBlock(block){
  if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');block=structuredClone(block);
  if(!block?.header)throw new Error('INVALID_POW_BLOCK');const id=blockHash(block.header);if(this.#nodes.has(id)){if(canonicalSerialize(this.block(id))!==canonicalSerialize(block))throw new Error('POW_REPLAY_BODY_MISMATCH');return{accepted:true,replayed:true,best_changed:false,tip:this.tip};}
  this.#busy=true;
  try{const encoded=canonicalSerialize(block),bytes=Buffer.byteLength(encoded);if(bytes>this.#limits.maxBlockBytes)throw new Error('POW_BLOCK_SIZE_CAPACITY');const row=await this.#check(block);this.#reserve(bytes,block.header.parent);this.#db.exec('BEGIN IMMEDIATE');try{this.#db.prepare('INSERT INTO pow_blocks VALUES(?,?,?,?,?)').run(row.hash,block.header.parent,block.header.height,row.work,encoded);this.#db.exec('COMMIT');}catch(error){this.#db.exec('ROLLBACK');throw error;}
   this.#storeRow(row,bytes);const previous=this.#best.hash;const changed=this.#consider(row);
   return{accepted:true,replayed:false,best_changed:changed,reorganized:changed&&block.header.parent!==previous,tip:this.tip};
  }finally{this.#busy=false;}
 }
 async validateTransaction(transaction,proof){
  if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');this.#busy=true;
  try{await this.withState(state=>state.applyTransaction(transaction,proof,this.#best.height+1));return true;}finally{this.#busy=false;}
 }
 async mine({ownerTag,transaction=null,proof=null,maxIterations=5000000,timestamp=Date.now()}){
  const parent=this.#best.hash,parents=this.#recentAncestors(parent),height=this.#best.height+1;
  const rewardValue=minerReward(this.#config,height,transaction);const reward=rewardValue?createPrivateNote({ownerTag,value:rewardValue,assetId:this.#config.monetary.asset_id}):null;
  const body={transaction:structuredClone(transaction),proof:structuredClone(proof),reward};
  const state=await this.#stateAt(parent);
  let header;
  try{await state.applyBody(body,height);header={version:'AEGIS_POW_HEADER_V2',network:openNetworkId(this.#config),height,parent,timestamp_ms:Math.max(timestamp,medianTime(this.#config,parents)+1),
    target:expectedTarget(this.#config,parents),nonce:'0'.repeat(64),body_hash:digest('AEGIS_POW_BODY_V1',body),note_root:state.noteRoot,nullifier_root:state.nullifierRoot,commitment_count:state.count};
  }finally{state.close();}
  const block={header:await mineHeader(header,{maxIterations}),...body};await this.addBlock(block);return block;
 }
 orphanedBundles(previousHash){
  const canonical=new Set(this.#canonical),bundles=[];let hash=previousHash;
  while(hash!==openNetworkId(this.#config)&&!canonical.has(hash)){
   const b=this.block(hash);if(!b)break;if(b.transaction)bundles.push({transaction:b.transaction,proof:b.proof});hash=b.header.parent;
  }return bundles;
 }
 transactionReceipt(requestId){const blocks=this.#branch(this.#best.hash,true);const block=blocks.find(b=>b.transaction?.request_id===requestId);if(!block)return undefined;
  const confirmations=this.#best.height-block.header.height+1;return{request_id:requestId,transaction_id:block.transaction.tx_id,height:block.header.height,block_hash:blockHash(block.header),confirmations,
   confirmations_required:this.#config.confirmations,status:confirmations>=this.#config.confirmations?'CONFIRMED_POW':'INCLUDED_POW',settled:false,finality:'probabilistic',production_ready:false};
 }
 close(){if(this.#closed)return;if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');this.#db.close();this.#closed=true;}
}
