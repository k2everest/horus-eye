import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {OpenNode} from './node.mjs';import {PowWallet} from './wallet.mjs';import {spendOwner} from '../../libs/crypto-core/shielded-note-v2.mjs';import {parseReceiveAddress} from './address.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');},prove:async()=>{throw Error('NO_PROOF_EXPECTED');}};
const password='a protected PoW wallet passphrase';
async function setup(t){const directory=mkdtempSync(join(tmpdir(),'pow-wallet-')),wallets=[],nodes=[];
 t.after(async()=>{for(const w of wallets)w.close();for(const n of nodes)await n.close();rmSync(directory,{recursive:true,force:true});});
 const config={schema:'AEGIS_OPEN_POW_V2',network_id:'wallet-test',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:3,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};
 const node=async name=>{const n=new OpenNode({chain:await OpenChain.open({directory:join(directory,name),config,backend})});await n.listen();nodes.push(n);return n;};
 const primary=await node('node');const wallet=async(name,peer=primary.origin)=>{const w=await PowWallet.open({directory:join(directory,name),config,peers:[peer],backend});wallets.push(w);return w;};
 return{directory,config,node,primary,wallet};
}
test('PoW wallet credits only verified confirmations/maturity and rejects cross-network addresses',async t=>{
 const f=await setup(t),w=await f.wallet('wallet'),initial=await w.create(password);
 assert.deepEqual((await w.sync()).balances,{});await f.primary.mine(initial.owner_tag);assert.deepEqual((await w.sync()).balances,{});
 await f.primary.mine(initial.owner_tag);let status=await w.sync();assert.equal(status.balances.AEGIS.confirmed,'7');assert.equal(status.balances.AEGIS.available,'0');assert.equal(status.balances.AEGIS.immature,'7');
 await f.primary.mine(initial.owner_tag);status=await w.sync();assert.equal(status.balances.AEGIS.available,'7');assert.equal(status.finality,'probabilistic');
 assert.equal(parseReceiveAddress(status.address,f.config).owner_tag,initial.owner_tag);
 assert.throws(()=>parseReceiveAddress(status.address,{...f.config,monetary:{...f.config.monetary,max_supply:'701'}}),/INVALID_POW_RECIPIENT/);
 w.lock();assert.equal(w.status().balances,undefined);await assert.rejects(w.unlock('incorrect but long password'),/UNLOCK_FAILED/);assert.equal((await w.unlock(password)).synchronized,false);
});
test('higher-work reorg removes orphaned rewards and old cofre cannot trust a lower-work restored view',async t=>{
 const f=await setup(t),w=await f.wallet('wallet'),initial=await w.create(password);
 for(let i=0;i<3;i++)await f.primary.mine(initial.owner_tag);await w.sync();const envelope=w.backup();
 const alternative=await f.node('alternative');for(let i=0;i<4;i++)await alternative.mine(spendOwner('01'.repeat(32)));
 for(const b of alternative.chain.blocks())await f.primary.chain.addBlock(b);
 assert.deepEqual((await w.sync()).balances,{});
 const weak=await f.node('weak');await weak.mine(spendOwner('02'.repeat(32)));const restored=await f.wallet('restored',weak.origin);
 await restored.restore({envelope,passphrase:password});await assert.rejects(restored.sync(),/BELOW_VERIFIED_WORK/);assert.equal(restored.status().synchronized,false);assert.deepEqual(restored.status().balances,{});
});
