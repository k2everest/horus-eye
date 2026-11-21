import test from 'node:test';import assert from 'node:assert/strict';
import crypto from 'node:crypto';import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {OpenNode} from './node.mjs';import {PowWallet} from './wallet.mjs';
import {MAX_AEGIS} from './queer-units.mjs';import {openNetworkId,digest,mineHeader} from './consensus.mjs';
import {defaultStarkBackend} from '../proof-engine/backend.mjs';import {statementForTransfer} from '../../libs/crypto-core/transfer-v2.mjs';
import {createPowBackup,restorePowBackup} from './recovery.mjs';import {recoverFromPeers} from './peer-recovery.mjs';

test('QUEER V3 native proof pays fees after the fixed cap, rejects overpayment, survives reorg and recovers',{skip:process.env.AEGIS_QUEER_POW_INTEGRATION!=='1',timeout:600000},async t=>{
 const backend=defaultStarkBackend();assert.ok(backend.availableForProving());const root=mkdtempSync(join(tmpdir(),'queer-native-')),wallets=[],nodes=[];
 t.after(async()=>{for(const w of wallets)w.close();for(const n of nodes)await n.close();rmSync(root,{recursive:true,force:true});});
 const limit='00'+'ff'.repeat(31),floor=(BigInt('0x'+limit)/16n).toString(16).padStart(64,'0');
 const config={schema:'AEGIS_OPEN_POW_V3',network_id:'queer-native-lab',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:limit,target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,
  difficulty:{policy:'supply-quadratic-v1',minimum_target:floor},monetary:{asset_id:'QUEER',base_reward:Number(MAX_AEGIS/3n),max_supply:MAX_AEGIS.toString(),fee_policy:'miner-fees-v1',minimum_fee:1}};
 const chainDir=join(root,'node'),node=new OpenNode({chain:await OpenChain.open({directory:chainDir,config,backend})});await node.listen();nodes.push(node);
 const open=async name=>{const w=await PowWallet.open({directory:join(root,name),config,peers:[node.origin],backend});wallets.push(w);return w;};
 const sender=await open('sender'),receiver=await open('receiver'),password='QUEER native test wallet password';
 const initial=await sender.create(password),recipient=await receiver.create(password);
 for(let i=0;i<3;i++)await node.mine(initial.owner_tag);
 assert.equal(node.chain.status().protocol_minted_supply,MAX_AEGIS.toString());
 await sender.sync();console.log('Proving a QUEER V3 transfer with a fresh native STARK after the exact cap');
 await sender.send({recipient:recipient.address,assetId:'QUEER',amount:'105000000'});
 const miner='03'.repeat(32);await node.mine(miner);await node.mine(miner);
 const block=node.chain.blockAt(4);assert.equal(block.header.version,'AEGIS_POW_HEADER_V3');assert.equal(block.header.target,floor);assert.equal(block.reward.value,1);assert.equal(node.chain.blockAt(5).reward,null);
 const from=await sender.sync(),to=await receiver.sync();
 assert.equal(from.balances.QUEER.available,(MAX_AEGIS-105000001n).toString());assert.equal(to.balances.QUEER.available,'105000000');
 assert.equal(BigInt(from.balances.QUEER.confirmed)+BigInt(to.balances.QUEER.confirmed)+BigInt(block.reward.value),MAX_AEGIS);
 const alteredConfig={...config,difficulty:{...config.difficulty,minimum_target:(BigInt('0x'+floor)/2n).toString(16).padStart(64,'0')}};
 assert.equal((await backend.verify({statement:{...statementForTransfer(block.transaction),network_id:openNetworkId(alteredConfig)},proof:block.proof})).valid,false);
 const forged=structuredClone(block);forged.reward.value=2;forged.header.body_hash=digest('AEGIS_POW_BODY_V1',{transaction:forged.transaction,proof:forged.proof,reward:forged.reward});forged.header=await mineHeader(forged.header);
 await assert.rejects(node.chain.addBlock(forged),/SUBSIDY/);
 const alternative=await OpenChain.open({directory:join(root,'fork'),config,backend});
 try{for(let height=1;height<=3;height++)await alternative.addBlock(node.chain.blockAt(height));for(let height=4;height<=6;height++)await alternative.mine({ownerTag:miner});for(let height=4;height<=6;height++)await node.chain.addBlock(alternative.blockAt(height));}finally{alternative.close();}
 const reorganized=await sender.sync();assert.equal(reorganized.pending.length,1);assert.equal(reorganized.balances.QUEER.reserved,String(config.monetary.base_reward));assert.deepEqual((await receiver.sync()).balances,{});
 const keyFile=join(root,'backup.key');writeFileSync(keyFile,crypto.randomBytes(32).toString('hex'),{mode:0o600});
 const archive=await createPowBackup({chainDirectory:chainDir,config,outputDirectory:join(root,'backups'),keyFile,backend});
 const restored=await restorePowBackup({backupDirectory:archive.directory,destinationDirectory:join(root,'restored'),config,keyFile,minimumWork:node.chain.tip.work,backend});assert.deepEqual(restored.tip,node.chain.tip);
 const peers=await recoverFromPeers({destinationDirectory:join(root,'peer-recovered'),config,peers:[node.origin],minimumWork:node.chain.tip.work,backend});assert.equal(peers.report.outcome,'VERIFIED');assert.deepEqual(peers.report.tip,node.chain.tip);
});
