import test from 'node:test';import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {PowWallet} from './wallet.mjs';import {OpenChain} from './chain.mjs';import {OpenNode} from './node.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';import {spendOwner} from '../../libs/crypto-core/shielded-note-v2.mjs';
import {statementForTransfer} from '../../libs/crypto-core/transfer-v2.mjs';
import {createPowBackup,restorePowBackup} from './recovery.mjs';

test('native PoW wallet: mature spend, recipient, confirmed reorg, reservations, encrypted backup and verified restore',
 {skip:process.env.AEGIS_POW_WALLET_INTEGRATION!=='1',timeout:600000},async t=>{
 const backend=defaultStarkBackend();assert.ok(backend.availableForProving());
 const directory=mkdtempSync(join(tmpdir(),'aegis-pow-wallet-native-')),wallets=[],nodes=[];
 t.after(async()=>{for(const w of wallets)w.close();for(const n of nodes)await n.close();rmSync(directory,{recursive:true,force:true});});
 const config={schema:'AEGIS_OPEN_POW_V2',network_id:'pow-wallet-native',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'21',fee_policy:'miner-fees-v1',minimum_fee:1}};
 const chainDir=join(directory,'node');const node=new OpenNode({chain:await OpenChain.open({directory:chainDir,config,backend})});await node.listen();nodes.push(node);
 const open=async name=>{const wallet=await PowWallet.open({directory:join(directory,name),config,peers:[node.origin],backend});wallets.push(wallet);return wallet;};
 const sender=await open('sender'),recipient=await open('recipient'),password='native wallet secret passphrase';
 const initial=await sender.create(password),to=await recipient.create(password);assert.deepEqual((await sender.sync()).balances,{});
 for(let i=0;i<3;i++)await node.mine(initial.owner_tag);assert.equal((await sender.sync()).balances.AEGIS.available,'14');
 console.log('Proving a transfer locally with the real STARK engine');await sender.send({recipient:to.address,assetId:'AEGIS',amount:'3'});
 assert.equal(sender.status().minimum_transaction_fee,'1');
 const pendingBackup=sender.backup(),request=sender.status().pending[0].request_id;
 const externalOwner=spendOwner('77'.repeat(32));await node.mine(externalOwner);await node.mine(externalOwner);
 const feeBlock=node.chain.blockAt(4);assert.equal(feeBlock.transaction.public_amount,1);assert.equal(feeBlock.reward.value,1);assert.equal(node.chain.blockAt(5).reward,null);assert.equal(node.chain.status().protocol_minted_supply,'21');
 assert.equal((await backend.verify({statement:{...statementForTransfer(feeBlock.transaction),public_amount:2},proof:feeBlock.proof})).valid,false);
 assert.equal((await sender.sync()).balances.AEGIS.available,'17');assert.equal(sender.status().pending.length,0);
 assert.equal((await recipient.sync()).balances.AEGIS.available,'3');assert.equal(sender.confirmationEvidence(request).receipt.status,'CONFIRMED_POW');
 const alternative=await OpenChain.open({directory:join(directory,'alternative'),config,backend});
 try{
  for(let h=1;h<=3;h++)await alternative.addBlock(node.chain.blockAt(h));
  for(let h=4;h<=6;h++)await alternative.mine({ownerTag:externalOwner});
  for(let h=4;h<=6;h++)await node.chain.addBlock(alternative.blockAt(h));
 }finally{alternative.close();}
 const after=await sender.sync();assert.equal(after.balances.AEGIS.confirmed,'21');assert.equal(after.balances.AEGIS.reserved,'7');assert.equal(after.balances.AEGIS.available,'14');assert.equal(after.pending.length,1);
 assert.equal(sender.confirmationEvidence(request),undefined);assert.deepEqual((await recipient.sync()).balances,{});
 const restored=await open('restored');await restored.restore({envelope:pendingBackup,passphrase:password});assert.equal(restored.status().synchronized,false);
 assert.equal((await restored.sync()).balances.AEGIS.reserved,'7');assert.equal(restored.status().address,initial.address);
 const keyFile=join(directory,'backup.key');writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const archived=await createPowBackup({chainDirectory:chainDir,config,outputDirectory:join(directory,'backups'),keyFile,backend});
 const target=join(directory,'recovered-node');const recovered=await restorePowBackup({backupDirectory:archived.directory,destinationDirectory:target,config,keyFile,minimumWork:node.chain.tip.work,backend});
 assert.equal(recovered.tip.hash,node.chain.tip.hash);
 const verified=await OpenChain.open({directory:target,config,backend});try{assert.equal(verified.tip.hash,node.chain.tip.hash);}finally{verified.close();}
});
