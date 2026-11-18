import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {OpenChain} from './chain.mjs';
import {OpenNode} from './node.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {newWalletSecrets,walletPublicIdentity} from '../wallet-local/vault.mjs';
import {createPrivateNote,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {prepareTransferV2,openTransferOutputV2} from '../../libs/crypto-core/transfer-v2.mjs';

test('native STARK spends a mature PoW reward across independent full nodes and survives restart',
 {skip:process.env.AEGIS_OPEN_POW_INTEGRATION!=='1',timeout:600000},async t=>{
 const backend=defaultStarkBackend();assert.ok(backend.availableForProving(),'real prover required');
 const directory=mkdtempSync(join(tmpdir(),'aegis-open-native-'));const nodes=[];
 t.after(async()=>{for(const n of nodes)await n.close();rmSync(directory,{recursive:true,force:true});});
 const secrets=newWalletSecrets(),recipient=newWalletSecrets(),identity=walletPublicIdentity(secrets),to=walletPublicIdentity(recipient);
 const config={schema:'AEGIS_OPEN_POW_V1',network_id:'open-native-integration',program_id:backend.programId,genesis_time_ms:Date.now()-60000,
  pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,
  monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};
 for(let i=0;i<3;i++){const chain=await OpenChain.open({directory:join(directory,String(i)),config,backend});const node=new OpenNode({chain});await node.listen();nodes.push(node);}
 for(const node of nodes)for(const peer of nodes)if(peer!==node)node.addPeer(peer.origin);
 for(let i=0;i<3;i++)await nodes[0].mine(identity.owner_tag);
 for(const node of nodes)await node.sync();
 const reward=nodes[0].chain.blockAt(1).reward;
 const outputs=[{note:createPrivateNote({ownerTag:to.owner_tag,value:3,assetId:'AEGIS'}),recipientPublicKey:to.kem_public_key},
  {note:createPrivateNote({ownerTag:identity.owner_tag,value:4,assetId:'AEGIS'}),recipientPublicKey:identity.kem_public_key}];
 const prepared=await nodes[0].chain.withState(state=>prepareTransferV2({requestId:'native-open-transfer',networkId:config.network_id,
  anchorStateRoot:state.noteRoot,privateKey:crypto.createPrivateKey(secrets.signing_private_key),
  inputs:[{note:reward,spend_secret:secrets.spend_secret,membership:state.ledger.inclusionProof({commitment:noteCommitmentV2(reward)}).proof}],outputs}));
 console.log('Generating a new native STARK from a mined reward (no simulated verifier)');
 const proof=await backend.prove(prepared);
 // A block arrives while the proof is being built: historical canonical roots remain usable.
 await nodes[0].mine(identity.owner_tag);for(const node of nodes)await node.sync();
 const response=await fetch(nodes[1].origin+'/submit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({transaction:prepared.transaction,proof})});
 assert.equal(response.status,200,await response.text());
 const block=await nodes[1].mine(identity.owner_tag);assert.equal(block.transaction.tx_id,prepared.transaction.tx_id);
 await nodes[1].mine(identity.owner_tag);for(const node of nodes)await node.sync();
 for(const node of nodes){assert.equal(node.chain.tip.hash,nodes[1].chain.tip.hash);assert.equal(node.chain.transactionReceipt('native-open-transfer').status,'CONFIRMED_POW');
  await assert.rejects(node.chain.validateTransaction(prepared.transaction,proof));}
 const opened=openTransferOutputV2({transaction:prepared.transaction,index:0,recipientPrivateKey:crypto.createPrivateKey(recipient.kem_private_key),spendSecret:recipient.spend_secret});
 assert.equal(opened.value,3);const tip=nodes[2].chain.tip;await nodes[2].close();
 const recovered=await OpenChain.open({directory:join(directory,'2'),config,backend});try{assert.deepEqual(recovered.tip,tip);}finally{recovered.close();}
});
