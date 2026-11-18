import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PersistentLedger} from '../ledger-state/store.mjs';
import {verifyTransferSignature,statementForTransfer} from '../../libs/crypto-core/transfer-v2.mjs';
import {noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {genesisTip,digest,subsidy,assertBlockHeader,blockHash} from './consensus.mjs';
export class BranchState {
 #directory;#config;#roots=[];#mints=new Map();#nullifiers=new Set();#backend;
 constructor(config,backend=defaultStarkBackend()){
  this.#directory=mkdtempSync(join(tmpdir(),'aegis-pow-state-'));this.#config=config;this.#backend=backend;
  this.ledger=new PersistentLedger({filename:join(this.#directory,'state.sqlite'),networkId:config.network_id});this.#roots.push(genesisTip(config).note_root);
 }
 get noteRoot(){return this.ledger.latest().root;}
 get count(){return this.ledger.latest().commitment_count;}
 get nullifierRoot(){return digest('AEGIS_POW_NULLIFIERS_V1',[...this.#nullifiers].sort());}
 isMature(commitment,spendHeight){const height=this.#mints.get(commitment);return height===undefined||spendHeight-height>=this.#config.coinbase_maturity;}
 async applyTransaction(transaction,proof,height){
  transaction=structuredClone(transaction);proof=structuredClone(proof);
  if(!verifyTransferSignature(transaction)||transaction.network_id!==this.#config.network_id||transaction.public_asset_id!==this.#config.monetary.asset_id||transaction.public_amount!==0||
   !this.#roots.slice(-this.#config.anchor_window).includes(transaction.anchor_state_root)||transaction.input_commitments.some(c=>!this.isMature(c,height)))throw new Error('INVALID_POW_TRANSACTION_POLICY_OR_ANCHOR');
  const result=await this.#backend.verify({statement:statementForTransfer(transaction),proof});
  if(!result.valid||result.program_id!==this.#config.program_id)throw new Error('POW_REQUIRES_VALID_NATIVE_STARK');
  this.ledger.commitTransition({transactionId:transaction.tx_id,requestId:transaction.request_id,expectedRoot:this.noteRoot,inputCommitments:transaction.input_commitments,newCommitments:transaction.output_commitments,
   nullifiers:transaction.nullifiers,verification:{scheme:proof.scheme,program_id:result.program_id,proof_digest:result.proof_digest},publicTransaction:transaction,proof});
  for(const n of transaction.nullifiers)this.#nullifiers.add(n);
 }
 async applyBody(block,height){
  if(block.transaction!==null)await this.applyTransaction(block.transaction,block.proof,height);
  if(subsidy(this.#config,height)>0){const commitment=noteCommitmentV2(block.reward);this.ledger.appendProtocolReward(commitment);this.#mints.set(commitment,height);}
  this.#roots.push(this.noteRoot);
 }
 async replay(blocks,{now=Date.now()}={}){
  const ancestors=[];
  for(const block of blocks){assertBlockHeader(this.#config,block,ancestors,{now});await this.applyBody(block,block.header.height);
   if(this.noteRoot!==block.header.note_root||this.nullifierRoot!==block.header.nullifier_root||this.count!==block.header.commitment_count)throw new Error('POW_STATE_ROOT_MISMATCH');ancestors.push(block);}
  return this;
 }
 close(){this.ledger.close();rmSync(this.#directory,{recursive:true,force:true});}
}
