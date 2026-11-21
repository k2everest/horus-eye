import {IncrementalMerkleTree,createInclusionProof} from '../../libs/crypto-core/merkle-proof.mjs';
import {verifyTransferSignature,statementForTransfer} from '../../libs/crypto-core/transfer-v2.mjs';
import {noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {genesisTip,digest,minerReward,assertBlockHeader,openNetworkId} from './consensus.mjs';

// Only process-local copies of previously verified state; never peer snapshots.
export class BranchState {
 #config;#backend;#data;#tree;
 constructor(config,backend=defaultStarkBackend(),snapshot){
  this.#config=config;this.#backend=backend;
  this.#data=snapshot?structuredClone(snapshot):{commitments:[],known:new Set(),spent:new Set(),nullifiers:new Set(),mints:new Map(),requests:new Set(),transactions:new Set(),roots:[genesisTip(config).note_root]};
  if(this.#data.merkle){
   this.#tree=new IncrementalMerkleTree(this.#data.merkle);
   if(this.#tree.count!==this.#data.commitments.length)throw new Error('POW_LOCAL_FRONTIER_COUNT_MISMATCH');
   delete this.#data.merkle;
  }else{
   this.#tree=new IncrementalMerkleTree();
   for(const commitment of this.#data.commitments)this.#tree.append(commitment);
  }
 }
 get noteRoot(){return this.#tree.root;}
 get count(){return this.#data.commitments.length;}
 get nullifierRoot(){return digest('AEGIS_POW_NULLIFIERS_V1',[...this.#data.nullifiers].sort());}
 get ledger(){const self=this;return{
  latest:()=>({root:self.noteRoot,commitment_count:self.count}),
  snapshot:()=>({root:self.noteRoot,commitments:[...self.#data.commitments]}),
  hasNullifier:n=>self.#data.nullifiers.has(n),
  inclusionProof:({commitment})=>{const index=self.#data.commitments.indexOf(commitment);if(index<0)throw new Error('UNKNOWN_COMMITMENT');return{root:self.noteRoot,proof:createInclusionProof(self.#data.commitments,index)};},
 };}
 snapshot(){return{...structuredClone(this.#data),merkle:this.#tree.snapshot()};}
 isMature(commitment,height){const minted=this.#data.mints.get(commitment);return minted===undefined||height-minted>=this.#config.coinbase_maturity;}
 async applyTransaction(transaction,proof,height){
  transaction=structuredClone(transaction);proof=structuredClone(proof);const d=this.#data;
  if(!verifyTransferSignature(transaction)||transaction.network_id!==openNetworkId(this.#config)||transaction.public_asset_id!==this.#config.monetary.asset_id||
   !d.roots.includes(transaction.anchor_state_root)||transaction.input_commitments.some(c=>!this.isMature(c,height)))throw new Error('INVALID_POW_TRANSACTION_POLICY_OR_ANCHOR');
  minerReward(this.#config,height,transaction);
  if(d.requests.has(transaction.request_id)||d.transactions.has(transaction.tx_id))throw new Error('POW_TRANSACTION_ALREADY_INCLUDED');
  if(transaction.input_commitments.some(c=>!d.known.has(c)||d.spent.has(c))||transaction.nullifiers.some(n=>d.nullifiers.has(n)))throw new Error('POW_INPUT_ALREADY_SPENT_OR_UNKNOWN');
  if(transaction.output_commitments.some(c=>d.known.has(c))||this.count+transaction.output_commitments.length>1000000)throw new Error('POW_OUTPUT_CONFLICT_OR_CAPACITY');
  const result=await this.#backend.verify({statement:statementForTransfer(transaction),proof});
  if(!result.valid||result.program_id!==this.#config.program_id)throw new Error('POW_REQUIRES_VALID_NATIVE_STARK');
  for(const c of transaction.input_commitments)d.spent.add(c);
  for(const n of transaction.nullifiers)d.nullifiers.add(n);
  for(const c of transaction.output_commitments){d.commitments.push(c);d.known.add(c);this.#tree.append(c);}
  d.requests.add(transaction.request_id);d.transactions.add(transaction.tx_id);
 }
 async applyBody(block,height){
  if(block.transaction!==null)await this.applyTransaction(block.transaction,block.proof,height);
  if(minerReward(this.#config,height,block.transaction)>0){const c=noteCommitmentV2(block.reward);
   if(this.#data.known.has(c)||this.count>=1000000)throw new Error('POW_REWARD_CONFLICT_OR_CAPACITY');
   this.#data.commitments.push(c);this.#data.known.add(c);this.#data.mints.set(c,height);this.#tree.append(c);
  }
  this.#data.roots.push(this.noteRoot);this.#data.roots=this.#data.roots.slice(-this.#config.anchor_window);
 }
 async replay(blocks,{now=Date.now()}={}){const ancestors=[];for(const block of blocks){assertBlockHeader(this.#config,block,ancestors,{now});await this.applyBody(block,block.header.height);
  if(this.noteRoot!==block.header.note_root||this.nullifierRoot!==block.header.nullifier_root||this.count!==block.header.commitment_count)throw new Error('POW_STATE_ROOT_MISMATCH');ancestors.push(block);}return this;}
 close(){}
}
