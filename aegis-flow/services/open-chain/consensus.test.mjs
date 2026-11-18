import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {OpenChain} from './chain.mjs';
import {assertOpenGenesis,openNetworkId,blockHash,digest,mineHeader,subsidy} from './consensus.mjs';
import {OpenNode} from './node.mjs';
import {syncPeer,miningCandidate} from './network.mjs';
import {spendOwner,noteCommitmentV2} from '../../libs/crypto-core/shielded-note-v2.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw new Error('NO_TRANSACTION_EXPECTED');}};
function setup(t){const directory=mkdtempSync(join(tmpdir(),'aegis-pow-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const config={schema:'AEGIS_OPEN_POW_V1',network_id:'open-pow-unit',program_id:backend.programId,genesis_time_ms:Date.now()-1000000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:1000,retarget_interval:4,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};return{directory,config};}
test('open genesis has no authority/country registry and subsidy is deterministic/capped',t=>{
 const{config}=setup(t);assert.equal(assertOpenGenesis(config),config);assert.equal(subsidy(config,1),7);assert.equal(subsidy({...config,monetary:{...config.monetary,max_supply:'10'}},2),3);assert.equal(subsidy(config,101),0);
 assert.throws(()=>assertOpenGenesis({...config,authority_public_key:'not-allowed'}),/INVALID_OPEN_GENESIS/);assert.throws(()=>assertOpenGenesis({...config,country:'BR'}),/INVALID_OPEN_GENESIS/);
 assert.notEqual(openNetworkId(config),openNetworkId({...config,monetary:{...config.monetary,max_supply:'701'}}));
});
test('untrusted mempool replies cannot redirect mining rewards or override local work limits',()=>{
 assert.deepEqual(miningCandidate(null),{transaction:null,proof:null});
 assert.throws(()=>miningCandidate({transaction:{},proof:{},ownerTag:'attacker'}),/INVALID_POW_MEMPOOL/);
 assert.throws(()=>miningCandidate({transaction:{},proof:{},maxIterations:100000000}),/INVALID_POW_MEMPOOL/);
});
test('partial last reward reaches the exact cap and subsequent blocks cannot issue more',async t=>{
 const{directory,config}=setup(t);config.monetary.max_supply='10';
 const chain=await OpenChain.open({directory,config,backend});t.after(()=>chain.close());
 const ownerTag=spendOwner('08'.repeat(32));
 assert.equal((await chain.mine({ownerTag})).reward.value,7);
 assert.equal((await chain.mine({ownerTag})).reward.value,3);
 const third=await chain.mine({ownerTag});assert.equal(third.reward,null);
 assert.equal(chain.tip.commitment_count,2);assert.equal(chain.status().protocol_minted_supply,'10');
 const altered=structuredClone(third);altered.reward=chain.blockAt(1).reward;
 altered.header.body_hash=digest('AEGIS_POW_BODY_V1',{transaction:null,proof:null,reward:altered.reward});altered.header=await mineHeader(altered.header);
 await assert.rejects(chain.addBlock(altered),/UNEXPECTED_COINBASE/);
});
test('work, subsidy and state roots are checked before adopting a block',async t=>{
 const{directory,config}=setup(t),chain=await OpenChain.open({directory,config,backend});t.after(()=>chain.close());
 const block=await chain.mine({ownerTag:spendOwner('01'.repeat(32)),timestamp:config.genesis_time_ms+1000});assert.equal(chain.tip.height,1);assert.equal(chain.status().monetary_authority,null);
 const changed=structuredClone(block);changed.reward.value++;await assert.rejects(chain.addBlock(changed),/REPLAY_BODY/);
 const other=await OpenChain.open({directory:join(directory,'other'),config,backend});t.after(()=>other.close());
 changed.header.body_hash=digest('AEGIS_POW_BODY_V1',{transaction:changed.transaction,proof:changed.proof,reward:changed.reward});changed.header=await mineHeader(changed.header);
 await assert.rejects(other.addBlock(changed),/SUBSIDY/);
 const root=structuredClone(block);root.header.note_root='11'.repeat(32);root.header=await mineHeader(root.header);await assert.rejects(other.addBlock(root),/STATE_ROOT/);
 const weak=structuredClone(block);weak.header.target='ff'.repeat(32);weak.header=await mineHeader(weak.header);await assert.rejects(other.addBlock(weak),/HEADER_OR_WORK/);
 assert.equal(other.tip.height,0);
});
test('shorter higher-work chain replaces deeper confirmations; independent database survives restart',async t=>{
 const{directory,config}=setup(t);let a=await OpenChain.open({directory:join(directory,'a'),config,backend});const b=await OpenChain.open({directory:join(directory,'b'),config,backend});t.after(()=>a.close());t.after(()=>b.close());
 for(let h=1;h<=9;h++)await a.mine({ownerTag:spendOwner('02'.repeat(32)),timestamp:config.genesis_time_ms+h*1000});
 const oldCommitment=noteCommitmentV2(a.blockAt(1).reward),old=a.tip;
 for(let h=1;h<=6;h++)await b.mine({ownerTag:spendOwner('03'.repeat(32)),timestamp:config.genesis_time_ms+h});
 assert.ok(BigInt(b.tip.work)>BigInt(old.work));assert.ok(b.tip.height<old.height);
 for(const block of b.blocks())await a.addBlock(block);
 assert.equal(a.tip.hash,b.tip.hash);assert.equal(a.status().finality,'probabilistic');
 await a.withState(state=>assert.equal(state.ledger.snapshot().commitments.includes(oldCommitment),false));
 const best=a.tip;a.close();a=await OpenChain.open({directory:join(directory,'a'),config,backend});assert.deepEqual(a.tip,best);
 await assert.rejects(OpenChain.open({directory:join(directory,'a'),config:{...config,monetary:{...config.monetary,max_supply:'701'}},backend}),/GENESIS_IMMUTABLE/);
});
test('four independently stored nodes gossip and catch up after a partition, without finalizer keys',async t=>{
 const{directory,config}=setup(t),nodes=[];t.after(async()=>{for(const n of nodes)await n.close();});
 for(let i=0;i<4;i++){const chain=await OpenChain.open({directory:join(directory,`n${i}`),config,backend});const node=new OpenNode({chain});await node.listen();nodes.push(node);}
 nodes[0].addPeer(nodes[1].origin);nodes[1].addPeer(nodes[2].origin);nodes[2].addPeer(nodes[0].origin);
 const block=await nodes[0].mine(spendOwner('04'.repeat(32)),{timestamp:config.genesis_time_ms+1000});
 for(let i=0;i<30&&nodes[2].chain.tip.height===0;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(nodes[2].chain.tip.hash,blockHash(block.header));assert.equal(nodes[3].chain.tip.height,0);
 nodes[3].addPeer(nodes[1].origin);await nodes[3].sync();assert.equal(nodes[3].chain.tip.hash,blockHash(block.header));
 const response=await fetch(nodes[3].origin+'/chain/status');assert.equal(response.status,200);assert.equal((await response.json()).monetary_authority,null);
});
test('stored chainwork is recomputed rather than trusted at restart',async t=>{
 const{directory,config}=setup(t);const chain=await OpenChain.open({directory,config,backend});await chain.mine({ownerTag:spendOwner('05'.repeat(32)),timestamp:config.genesis_time_ms+1000});chain.close();
 const db=new DatabaseSync(join(directory,'chain.sqlite'));db.exec("UPDATE pow_blocks SET work='999999999999'");db.close();
 await assert.rejects(OpenChain.open({directory,config,backend}),/REVALIDATION_FAILED/);
});
test('bounded synchronization advances along a side branch before it has enough work to win',async t=>{
 const{directory,config}=setup(t);config.retarget_interval=64;
 const local=await OpenChain.open({directory:join(directory,'local'),config,backend});t.after(()=>local.close());
 const remote=new OpenNode({chain:await OpenChain.open({directory:join(directory,'remote'),config,backend})});await remote.listen();t.after(()=>remote.close());
 for(let h=1;h<=20;h++)await local.mine({ownerTag:spendOwner('06'.repeat(32)),timestamp:config.genesis_time_ms+h*1000});
 for(let h=1;h<=22;h++)await remote.chain.mine({ownerTag:spendOwner('07'.repeat(32)),timestamp:config.genesis_time_ms+h*1000});
 const first=await syncPeer(local,remote.origin);assert.equal(first.imported,16);assert.equal(local.tip.height,20);
 const second=await syncPeer(local,remote.origin);assert.equal(second.imported,6);assert.equal(local.tip.hash,remote.chain.tip.hash);
});
