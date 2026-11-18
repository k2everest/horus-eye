import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
import {createPrivateNote} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {assertOpenGenesis,openNetworkId,genesisTip,blockHash,assertBlockHeader,expectedTarget,medianTime,subsidy,digest,mineHeader} from './consensus.mjs';
import {BranchState} from './state.mjs';
export class OpenChain {
 #db;#config;#nodes=new Map();#best;#backend;#busy=false;#closed=false;
 constructor({directory,config,backend=defaultStarkBackend()}){
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
 #branch(hash){const blocks=[];const seen=new Set();while(hash!==openNetworkId(this.#config)){if(seen.has(hash))throw new Error('POW_CHAIN_CYCLE');seen.add(hash);const row=this.#nodes.get(hash);if(!row)throw new Error('POW_UNKNOWN_PARENT');blocks.push(row.block);hash=row.block.header.parent;}return blocks.reverse();}
 blocks(hash=this.#best.hash){return structuredClone(this.#branch(hash));}
 block(hash){return this.#nodes.has(hash)?structuredClone(this.#nodes.get(hash).block):undefined;}
 blockAt(height){if(!Number.isSafeInteger(height)||height<1)return undefined;return this.blocks()[height-1];}
 hashAt(height){if(height===0)return openNetworkId(this.#config);const block=this.#branch(this.#best.hash)[height-1];return block?blockHash(block.header):undefined;}
 status(){const confirmed=this.confirmedHeight;const b=confirmed?this.#branch(this.#best.hash)[confirmed-1].header:undefined;
  return{model:'open-proof-of-work',config_id:openNetworkId(this.#config),network_id:this.#config.network_id,tip:this.tip,
   confirmed:{height:confirmed,checkpoint_id:confirmed?blockHash(b):openNetworkId(this.#config),root:b?.note_root??genesisTip(this.#config).note_root},
   confirmations_required:this.#config.confirmations,finality:'probabilistic',monetary_authority:null,protocol_minted_supply:(BigInt(this.#best.height)*BigInt(this.#config.monetary.base_reward)>BigInt(this.#config.monetary.max_supply)?BigInt(this.#config.monetary.max_supply):BigInt(this.#best.height)*BigInt(this.#config.monetary.base_reward)).toString(),production_ready:false};
 }
 async withState(operation,hash=this.#best.hash){const state=new BranchState(this.#config,this.#backend);try{await state.replay(this.#branch(hash));return await operation(state);}finally{state.close();}}
 async #check(block){const parents=this.#branch(block.header.parent);const checked=assertBlockHeader(this.#config,block,parents);
  const state=new BranchState(this.#config,this.#backend);try{await state.replay(parents);await state.applyBody(block,block.header.height);
   if(state.noteRoot!==block.header.note_root||state.nullifierRoot!==block.header.nullifier_root||state.count!==block.header.commitment_count)throw new Error('POW_STATE_ROOT_MISMATCH');
  }finally{state.close();}
  const parent=this.#nodes.get(block.header.parent);return{hash:checked.hash,work:((parent?BigInt(parent.work):0n)+checked.work).toString(),block};
 }
 #consider(row){const better=BigInt(row.work)>BigInt(this.#best.work)||(row.work===this.#best.work&&row.hash<this.#best.hash);
  if(better){const h=row.block.header;this.#best={hash:row.hash,height:h.height,work:row.work,note_root:h.note_root,nullifier_root:h.nullifier_root,commitment_count:h.commitment_count,timestamp_ms:h.timestamp_ms};}return better;
 }
 async #recover(){if(this.#db.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('POW_DATABASE_INTEGRITY_FAILED');
  for(const saved of this.#db.prepare('SELECT * FROM pow_blocks ORDER BY height,hash').all()){
   const row=await this.#check(JSON.parse(saved.block_json));if(row.hash!==saved.hash||row.work!==saved.work||row.block.header.parent!==saved.parent||row.block.header.height!==saved.height)throw new Error('POW_DATABASE_REVALIDATION_FAILED');
   this.#nodes.set(row.hash,row);this.#consider(row);
  }
 }
 async addBlock(block){
  if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');block=structuredClone(block);
  if(!block?.header)throw new Error('INVALID_POW_BLOCK');const id=blockHash(block.header);if(this.#nodes.has(id)){if(canonicalSerialize(this.#nodes.get(id).block)!==canonicalSerialize(block))throw new Error('POW_REPLAY_BODY_MISMATCH');return{accepted:true,replayed:true,best_changed:false,tip:this.tip};}
  this.#busy=true;
  try{const row=await this.#check(block);this.#db.exec('BEGIN IMMEDIATE');try{this.#db.prepare('INSERT INTO pow_blocks VALUES(?,?,?,?,?)').run(row.hash,block.header.parent,block.header.height,row.work,canonicalSerialize(block));this.#db.exec('COMMIT');}catch(error){this.#db.exec('ROLLBACK');throw error;}
   this.#nodes.set(row.hash,row);const previous=this.#best.hash;const changed=this.#consider(row);
   return{accepted:true,replayed:false,best_changed:changed,reorganized:changed&&block.header.parent!==previous,tip:this.tip};
  }finally{this.#busy=false;}
 }
 async validateTransaction(transaction,proof){
  if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');this.#busy=true;
  try{await this.withState(state=>state.applyTransaction(transaction,proof,this.#best.height+1));return true;}finally{this.#busy=false;}
 }
 async mine({ownerTag,transaction=null,proof=null,maxIterations=5000000,timestamp=Date.now()}){
  const parent=this.#best.hash,parents=this.#branch(parent),height=parents.length+1;
  const rewardValue=subsidy(this.#config,height);const reward=rewardValue?createPrivateNote({ownerTag,value:rewardValue,assetId:this.#config.monetary.asset_id}):null;
  const body={transaction:structuredClone(transaction),proof:structuredClone(proof),reward};
  const state=new BranchState(this.#config,this.#backend);
  let header;
  try{await state.replay(parents);await state.applyBody(body,height);header={version:'AEGIS_POW_HEADER_V1',network:openNetworkId(this.#config),height,parent,timestamp_ms:Math.max(timestamp,medianTime(this.#config,parents)+1),
    target:expectedTarget(this.#config,parents),nonce:'0'.repeat(64),body_hash:digest('AEGIS_POW_BODY_V1',body),note_root:state.noteRoot,nullifier_root:state.nullifierRoot,commitment_count:state.count};
  }finally{state.close();}
  const block={header:await mineHeader(header,{maxIterations}),...body};await this.addBlock(block);return block;
 }
 transactionReceipt(requestId){const blocks=this.#branch(this.#best.hash);const block=blocks.find(b=>b.transaction?.request_id===requestId);if(!block)return undefined;
  const confirmations=this.#best.height-block.header.height+1;return{request_id:requestId,transaction_id:block.transaction.tx_id,height:block.header.height,block_hash:blockHash(block.header),confirmations,
   confirmations_required:this.#config.confirmations,status:confirmations>=this.#config.confirmations?'CONFIRMED_POW':'INCLUDED_POW',settled:false,finality:'probabilistic',production_ready:false};
 }
 close(){if(this.#closed)return;if(this.#busy)throw new Error('POW_VALIDATOR_BUSY');this.#db.close();this.#closed=true;}
}
