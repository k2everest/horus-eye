import crypto from 'node:crypto';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {OpenChain} from './chain.mjs';
import {openNetworkId,minimumTransactionFee,minerReward} from './consensus.mjs';
import {syncPeer,peerOrigin,publicRequest} from './network.mjs';
import {receiveAddress,parseReceiveAddress} from './address.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {newWalletSecrets,walletPublicIdentity,createEncryptedVault,openEncryptedVault,readVault,sealPayload,atomicWriteVault} from '../wallet-local/vault.mjs';
import {noteWindow} from '../wallet-local/note-window.mjs';
import {createPrivateNote,noteCommitmentV2,noteNullifierV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {prepareTransferV2,openTransferOutputV2} from '../../libs/crypto-core/transfer-v2.mjs';

export class PowWallet {
 #chain;#backend;#peers;#path;#payload;#session;#busy=false;#synced=false;#closed=false;#entries=[];#balances={};#deferred=0;
 constructor({chain,backend,peers,directory}){
  if(!Array.isArray(peers)||!peers.length||peers.length>16)throw Error('POW_WALLET_PEERS_REQUIRED');
  this.#peers=[...new Set(peers.map(peerOrigin))];this.#chain=chain;this.#backend=backend;this.#path=join(directory,'wallet.vault.json');
 }
 static async open({directory,config,peers,backend=defaultStarkBackend(),limits}){
  const chain=await OpenChain.open({directory:join(directory,'verified-chain'),config,backend,limits});
  try{return new PowWallet({chain,backend,peers,directory});}catch(error){chain.close();throw error;}
 }
 get busy(){return this.#busy;}
 get locked(){return !this.#payload;}
 async #exclusive(operation){if(this.#closed)throw Error('WALLET_CLOSED');if(this.#busy)throw Error('WALLET_BUSY');this.#busy=true;
  try{const result=await operation();return{...result,busy:false};}finally{this.#busy=false;}}
 #unlocked(){if(!this.#payload)throw Error('WALLET_LOCKED');}
 #anchor(){return{model:'open-proof-of-work',height:this.#chain.tip.height,checkpoint_id:this.#chain.tip.hash,work:this.#chain.tip.work};}
 #validatePayload(payload){
  const a=payload.anchor;
  if(payload.config_id!==openNetworkId(this.#chain.config)||a.model!=='open-proof-of-work'||typeof a.work!=='string'||!/^(0|[1-9][0-9]{0,127})$/.test(a.work)||a.height===0&&a.checkpoint_id!==payload.config_id)throw Error('POW_VAULT_NETWORK_OR_ANCHOR_MISMATCH');
 }
 #save(){atomicWriteVault(this.#path,sealPayload(this.#payload,this.#session));}
 create(passphrase){return this.#exclusive(async()=>{
  if(existsSync(this.#path))throw Error('WALLET_ALREADY_EXISTS');
  const payload={schema:'AEGIS_WALLET_PRIVATE_V1',config_id:openNetworkId(this.#chain.config),secrets:newWalletSecrets(),notes:[],pending:[],anchor:this.#anchor()};
  const opened=await createEncryptedVault(payload,passphrase);
  try{atomicWriteVault(this.#path,opened.envelope);}catch(e){opened.session.key.fill(0);throw e;}
  this.#payload=payload;this.#session=opened.session;this.#synced=false;return this.status();
 });}
 async #openEnvelope(envelope,passphrase){
  const opened=await openEncryptedVault(envelope,passphrase);
  try{this.#validatePayload(opened.payload);}catch(e){opened.session.key.fill(0);throw e;}
  opened.payload.pending=opened.payload.pending.filter(p=>p.phase!=='PREPARING');return opened;
 }
 unlock(passphrase){return this.#exclusive(async()=>{
  if(!this.locked)throw Error('WALLET_ALREADY_UNLOCKED');
  const opened=await this.#openEnvelope(readVault(this.#path),passphrase);this.#payload=opened.payload;this.#session=opened.session;this.#synced=false;
  return this.status();
 });}
 restore({envelope,passphrase}){return this.#exclusive(async()=>{
  if(existsSync(this.#path))throw Error('RESTORE_REQUIRES_EMPTY_PROFILE');
  const opened=await this.#openEnvelope(structuredClone(envelope),passphrase);
  try{atomicWriteVault(this.#path,sealPayload(opened.payload,opened.session));}catch(e){opened.session.key.fill(0);throw e;}
  this.#payload=opened.payload;this.#session=opened.session;this.#synced=false;return this.status();
 });}
 lock(){if(this.#busy)throw Error('WALLET_BUSY');this.#session?.key.fill(0);this.#session=undefined;this.#payload=undefined;this.#synced=false;this.#entries=[];this.#balances={};this.#deferred=0;return this.status();}
 backup(){if(this.#busy)throw Error('WALLET_BUSY');return readVault(this.#path);}
 changePassphrase(passphrase){return this.#exclusive(async()=>{
  this.#unlocked();const opened=await createEncryptedVault(this.#payload,passphrase);
  try{atomicWriteVault(this.#path,opened.envelope);}catch(e){opened.session.key.fill(0);throw e;}
  this.#session.key.fill(0);this.#session=opened.session;return this.status();
 });}
 status(){
  const chain=this.#chain.status();const base={exists:existsSync(this.#path),locked:this.locked,busy:this.#busy,synchronized:this.#synced,network_id:chain.network_id,config_id:chain.config_id,
   consensus_model:chain.model,finality:chain.finality,confirmed:chain.confirmed,finalized:chain.confirmed,best_tip:chain.tip,minimum_transaction_fee:String(chain.minimum_transaction_fee),confirmations_required:chain.confirmations_required,production_ready:false};
  if(this.locked)return base;const identity=walletPublicIdentity(this.#payload.secrets);
  const balances=structuredClone(this.#balances);if(!this.#synced)for(const value of Object.values(balances))value.available='0';
  return{...base,address:receiveAddress(this.#chain.config,identity),owner_tag:identity.owner_tag,signer_tag:identity.signer_tag,balances,notes_deferred:this.#deferred,
   pending:this.#payload.pending.map(p=>({request_id:p.request_id,transaction_id:p.transaction_id,status:this.#chain.transactionReceipt(p.request_id)?.status??'PENDING_OR_ORPHANED_POW'}))};
 }
 #reserveOrphans(previousHash){
  const identity=walletPublicIdentity(this.#payload.secrets);
  for(const bundle of this.#chain.orphanedBundles(previousHash)){
   const tx=bundle.transaction;if(tx.sender_tag!==identity.signer_tag||this.#payload.pending.some(p=>p.transaction_id===tx.tx_id))continue;
   if(this.#payload.pending.length>=64)throw Error('POW_PENDING_CAPACITY');
   this.#payload.pending.push({request_id:tx.request_id,transaction_id:tx.tx_id,input_commitments:[...tx.input_commitments],phase:'BROADCASTING',bundle});
  }
  this.#synced=false;this.#save();
 }
 async #scan(){
  const config=this.#chain.config,identity=walletPublicIdentity(this.#payload.secrets),key=crypto.createPrivateKey(this.#payload.secrets.kem_private_key);
  const confirmed=this.#chain.confirmedHeight,confirmedHash=this.#chain.hashAt(confirmed),reserved=new Set(this.#payload.pending.flatMap(p=>p.input_commitments));
  const tip=await this.#chain.withState(s=>s.snapshot());
  const confirmedState=await this.#chain.withState(s=>s.snapshot(),confirmedHash);
  const window=noteWindow({existing:[],spendSecret:this.#payload.secrets.spend_secret,isSpent:n=>confirmedState.nullifiers.has(n)}),metadata=new Map();
  const add=(note,height)=>{window.add(note,height);const c=noteCommitmentV2(note);if(window.notes.has(c))metadata.set(c,{note,commitment:c,height});};
  for(let height=1;height<=confirmed;height++){
   const block=this.#chain.blockAt(height);if(block.reward?.owner_tag===identity.owner_tag)add(block.reward,height);
   const tx=block.transaction;if(!tx)continue;
   for(const[index,output]of tx.encrypted_outputs.entries())if(output.recipient_tag===identity.kem_tag){
    try{add(openTransferOutputV2({transaction:tx,index,recipientPrivateKey:key,spendSecret:this.#payload.secrets.spend_secret}).note,height);}catch{/* Never credit unauthenticated/incorrect openings. */}
   }
  }
  const balances=Object.create(null);this.#entries=[];
  for(const entry of metadata.values()){
   const nullifier=noteNullifierV2(entry.note,this.#payload.secrets.spend_secret),mint=tip.mints.get(entry.commitment);
   const mature=mint===undefined||this.#chain.tip.height+1-mint>=config.coinbase_maturity;
   const pending=reserved.has(entry.commitment)||tip.nullifiers.has(nullifier),spendable=mature&&!pending;
   const value=balances[entry.note.asset_id]??={confirmed:0n,reserved:0n,available:0n,immature:0n};value.confirmed+=BigInt(entry.note.value);
   if(pending)value.reserved+=BigInt(entry.note.value);else if(!mature)value.immature+=BigInt(entry.note.value);else value.available+=BigInt(entry.note.value);
   this.#entries.push({...entry,spendable});
  }
  for(const[asset,d]of window.deferred){const b=balances[asset]??={confirmed:0n,reserved:0n,available:0n,immature:0n};b.confirmed+=d.value;b.deferred=d.value;}
  this.#deferred=[...window.deferred.values()].reduce((n,v)=>n+v.count,0);this.#payload.notes=[...window.notes.values()];
  this.#balances=Object.fromEntries(Object.entries(balances).map(([asset,b])=>[asset,Object.fromEntries(Object.entries(b).map(([k,v])=>[k,v.toString()]))]));
 }
 async #sync(){
  this.#unlocked();this.#synced=false;
  // Recover a reorg committed before a previous process could save the vault.
  if(this.#chain.has(this.#payload.anchor.checkpoint_id))this.#reserveOrphans(this.#payload.anchor.checkpoint_id);
  const observedHeads=new Set();
  for(const peer of this.#peers){let localError;try{
   for(let batch=0;batch<4;batch++){const result=await syncPeer(this.#chain,peer,{maxBlocks:64,onBestChanged:hash=>{try{this.#reserveOrphans(hash);}catch(e){localError=e;throw e;}}});if(result.imported<64)break;}
   const head=await publicRequest(peer,'/chain/status');if(head.config_id===openNetworkId(this.#chain.config)&&head.tip?.hash===this.#chain.tip.hash)observedHeads.add(head.tip.hash);
  }catch{if(localError)throw localError;/* Another peer may provide a valid chain. */}}
  const watermark=this.#payload.anchor;
  if(BigInt(this.#chain.tip.work)<BigInt(watermark.work)||(this.#chain.tip.work===watermark.work&&this.#chain.tip.hash>watermark.checkpoint_id))throw Error('POW_RECOVERY_BELOW_VERIFIED_WORK');
  this.#payload.pending=this.#payload.pending.filter(p=>{const r=this.#chain.transactionReceipt(p.request_id);return r?.transaction_id!==p.transaction_id||r.status!=='CONFIRMED_POW';});
  await this.#scan();this.#payload.anchor=this.#anchor();this.#save();this.#synced=observedHeads.has(this.#chain.tip.hash);return this.status();
 }
 sync(){return this.#exclusive(()=>this.#sync());}
 async #broadcast(bundle){
  let accepted=false;
  for(const peer of this.#peers){try{const result=await publicRequest(peer,'/submit',bundle);if(result.accepted===true)accepted=true;}catch{/* Unknown outcome preserves the durable reservation. */}}
  if(!accepted)throw Error('POW_BROADCAST_NOT_ACKNOWLEDGED');
 }
 send({recipient,assetId,amount,fee=String(minimumTransactionFee(this.#chain.config))}){return this.#exclusive(async()=>{
  this.#unlocked();const destination=parseReceiveAddress(recipient,this.#chain.config);
  if(assetId!==this.#chain.config.monetary.asset_id||typeof amount!=='string'||!/^[1-9][0-9]{0,15}$/.test(amount)||!Number.isSafeInteger(Number(amount)))throw Error('INVALID_INTEGER_AMOUNT_OR_ASSET');
  if(typeof fee!=='string'||!/^(0|[1-9][0-9]{0,15})$/.test(fee)||!Number.isSafeInteger(Number(fee)))throw Error('INVALID_POW_TRANSACTION_FEE');
  minerReward(this.#chain.config,this.#chain.tip.height+1,{public_amount:Number(fee)});
  const required=BigInt(amount)+BigInt(fee);
  await this.#sync();if(!this.#synced)throw Error('WALLET_CATCH_UP_REQUIRED');if(this.#payload.pending.length)throw Error('PENDING_TRANSFER_MUST_BE_RESOLVED');
  const chosen=[];let total=0n;
  for(const e of this.#entries.filter(e=>e.spendable).sort((a,b)=>b.note.value-a.note.value||a.height-b.height).slice(0,4)){chosen.push(e);total+=BigInt(e.note.value);if(total>=required)break;}
  if(total<required||total>BigInt(Number.MAX_SAFE_INTEGER))throw Error('INSUFFICIENT_VERIFIED_FUNDS_OR_INPUT_LIMIT');
  const identity=walletPublicIdentity(this.#payload.secrets),outputs=[{note:createPrivateNote({ownerTag:destination.owner_tag,value:Number(amount),assetId}),recipientPublicKey:destination.kem_public_key}];
  if(total>required)outputs.push({note:createPrivateNote({ownerTag:identity.owner_tag,value:Number(total-required),assetId}),recipientPublicKey:identity.kem_public_key});
  const anchorHeight=Math.max(...chosen.map(e=>e.height),this.#chain.tip.height-this.#chain.config.anchor_window+1);
  const prepared=await this.#chain.withState(s=>prepareTransferV2({requestId:crypto.randomUUID(),networkId:openNetworkId(this.#chain.config),anchorStateRoot:s.noteRoot,
   privateKey:crypto.createPrivateKey(this.#payload.secrets.signing_private_key),inputs:chosen.map(e=>({note:e.note,spend_secret:this.#payload.secrets.spend_secret,membership:s.ledger.inclusionProof({commitment:e.commitment}).proof})),outputs,fee:Number(fee)}),this.#chain.hashAt(anchorHeight));
  const pending={request_id:prepared.transaction.request_id,transaction_id:prepared.transaction.tx_id,input_commitments:prepared.transaction.input_commitments,phase:'PREPARING',bundle:null};
  this.#payload.pending.push(pending);this.#save();let proof;
  try{proof=await this.#backend.prove(prepared);}catch(e){this.#payload.pending=this.#payload.pending.filter(p=>p!==pending);this.#save();throw e;}
  pending.phase='BROADCASTING';pending.bundle={transaction:prepared.transaction,proof};this.#save();
  await this.#broadcast(pending.bundle);this.#synced=false;return this.status();
 });}
 retryPending(){return this.#exclusive(async()=>{await this.#sync();if(!this.#synced)throw Error('WALLET_CATCH_UP_REQUIRED');for(const p of this.#payload.pending)if(p.phase==='BROADCASTING')await this.#broadcast(p.bundle);this.#synced=false;return this.status();});}
 confirmationEvidence(requestId){
  if(this.#busy)throw Error('WALLET_BUSY');this.#unlocked();const receipt=this.#chain.transactionReceipt(requestId);if(!receipt||receipt.status!=='CONFIRMED_POW')return undefined;
  const block=this.#chain.blockAt(receipt.height);if(block.transaction.sender_tag!==walletPublicIdentity(this.#payload.secrets).signer_tag)return undefined;
  return{schema:'AEGIS_POW_CONFIRMATION_V2',receipt,block,config_id:openNetworkId(this.#chain.config),settled:false,finality:'probabilistic'};
 }
 importGenesisNote(){throw Error('POW_GENESIS_HAS_NO_PREALLOCATED_NOTES');}
 close(){if(this.#closed)return;if(this.#busy)throw Error('WALLET_BUSY');this.#session?.key.fill(0);this.#payload=undefined;this.#session=undefined;this.#chain.close();this.#closed=true;}
}
