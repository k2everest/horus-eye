import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {blockHash} from './consensus.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');}};
for(const failure of ['INSERT','DELETE'])test(`storage pruning and new block roll back together after SQL ${failure} failure`,async t=>{
 const root=mkdtempSync(join(tmpdir(),'pow-atomic-')),config={schema:'AEGIS_OPEN_POW_V2',network_id:'atomic-pruning',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'TEST',base_reward:7,max_supply:'700'}};
 const directory=join(root,'node'),limits={maxBlocks:5};let chain=await OpenChain.open({directory,config,backend,limits});
 const fork=await OpenChain.open({directory:join(root,'fork'),config,backend}),source=await OpenChain.open({directory:join(root,'source'),config,backend});
 const db=new DatabaseSync(join(directory,'chain.sqlite'));
 t.after(()=>{db.close();source.close();fork.close();chain.close();rmSync(root,{recursive:true,force:true});});
 for(let i=0;i<3;i++)await chain.mine({ownerTag:'03'.repeat(32)});
 for(let i=0;i<2;i++){const block=await fork.mine({ownerTag:'04'.repeat(32)});await chain.addBlock(block);}
 for(const block of chain.blocks())await source.addBlock(block);
 const next=await source.mine({ownerTag:'03'.repeat(32)}),pruned=blockHash(fork.blockAt(2).header),before=chain.status();
 db.exec(`CREATE TRIGGER fail_capacity_commit BEFORE ${failure} ON pow_blocks BEGIN SELECT RAISE(ABORT, 'TEST_CAPACITY_FAILURE'); END;`);
 await assert.rejects(chain.addBlock(next),/TEST_CAPACITY_FAILURE/);
 assert.deepEqual(chain.tip,before.tip);assert.deepEqual(chain.status().resources,before.resources);assert.equal(chain.has(pruned),true);assert.deepEqual(chain.block(pruned),fork.blockAt(2));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pow_blocks').get().n,5);assert.equal(chain.has(blockHash(next.header)),false);
 db.exec('DROP TRIGGER fail_capacity_commit');
 await chain.addBlock(next);assert.equal(chain.has(pruned),false);assert.equal(chain.tip.hash,blockHash(next.header));assert.equal(chain.status().resources.stored_blocks,5);
 const tip=chain.tip;chain.close();chain=await OpenChain.open({directory,config,backend,limits});assert.deepEqual(chain.tip,tip);assert.equal(chain.has(pruned),false);
 for(let height=1;height<=4;height++)assert.equal(chain.hashAt(height),source.hashAt(height));
});
