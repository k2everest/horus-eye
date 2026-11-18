import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
import {MAX_AEGIS} from './queer-units.mjs';
import {assertOpenGenesis,openNetworkId,expectedTarget,supplyTarget,subsidy,protocolMintedSupply,blockHash,digest,mineHeader} from './consensus.mjs';
import {OpenChain} from './chain.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_TRANSACTION_EXPECTED');}};
const initial='00'+'ff'.repeat(31),floor=(BigInt('0x'+initial)/16n).toString(16).padStart(64,'0');
const configuration=()=>({schema:'AEGIS_OPEN_POW_V3',network_id:'queer-pow-test',program_id:backend.programId,genesis_time_ms:Date.now()-60000,
 pow_limit:initial,target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,
 difficulty:{policy:'supply-quadratic-v1',minimum_target:floor},monetary:{asset_id:'QUEER',base_reward:Number(MAX_AEGIS/3n),max_supply:MAX_AEGIS.toString(),fee_policy:'miner-fees-v1',minimum_fee:1}});

test('QUEER consensus fixes the exact cap and rejects altered currency, cap, policy and zero final target',()=>{
 const config=configuration();assert.equal(assertOpenGenesis(config),config);
 for(const monetary of [{...config.monetary,max_supply:(MAX_AEGIS+1n).toString()},{...config.monetary,max_supply:(MAX_AEGIS-1n).toString()},{...config.monetary,asset_id:'OTHER'},{asset_id:'QUEER',base_reward:7,max_supply:MAX_AEGIS.toString()}])assert.throws(()=>assertOpenGenesis({...config,monetary}),/MONETARY/);
 for(const difficulty of [{...config.difficulty,policy:'other'},{...config.difficulty,minimum_target:'0'.repeat(64)},{...config.difficulty,minimum_target:initial}])assert.throws(()=>assertOpenGenesis({...config,difficulty}),/DIFFICULTY/);
 const legacy={...config,schema:'AEGIS_OPEN_POW_V2'};delete legacy.difficulty;
 assert.notEqual(openNetworkId(config),openNetworkId(legacy));
});
test('quadratic global target follows issued supply exactly, has no timestamp relaxation and stays finite after the cap',()=>{
 const config=configuration(),limit=BigInt('0x'+initial);
 assert.equal(supplyTarget(config,1),initial);
 assert.equal(BigInt('0x'+supplyTarget(config,2)),limit*4n/9n);
 assert.equal(BigInt('0x'+supplyTarget(config,3)),limit/9n);
 assert.equal(supplyTarget(config,4),floor);assert.equal(supplyTarget(config,5),floor);
 for(const timestamp_ms of [1,100000000])assert.equal(expectedTarget(config,[{header:{height:2,timestamp_ms,target:initial}}]),supplyTarget(config,3));
 const lastUnit={...config,monetary:{...config.monetary,base_reward:1}};
 assert.equal(subsidy(lastUnit,Number(MAX_AEGIS)),1);assert.equal(subsidy(lastUnit,Number(MAX_AEGIS)+1),0);
 assert.equal(protocolMintedSupply(lastUnit,Number(MAX_AEGIS)+100),MAX_AEGIS);
 assert.equal(supplyTarget(lastUnit,Number(MAX_AEGIS)),floor);
 const partial={...config,monetary:{...config.monetary,base_reward:Number(MAX_AEGIS/3n)+1}};
 assert.equal([1,2,3,4].reduce((sum,h)=>sum+BigInt(subsidy(partial,h)),0n),MAX_AEGIS);
});
test('CLI creates an explicit fixed-cap genesis and refuses missing policy parameters or overwrite',t=>{
 const root=mkdtempSync(join(tmpdir(),'queer-genesis-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const file=join(root,'genesis.json'),script=fileURLToPath(new URL('../../scripts/open-chain.mjs',import.meta.url));
 const run=args=>spawnSync(process.execPath,[script,'queer-genesis','--output',file,...args],{encoding:'utf8'});
 assert.notEqual(run([]).status,0);assert.equal(existsSync(file),false);
 const args=['--base-reward','105000000','--minimum-target',floor];assert.equal(run(args).status,0);
 const bytes=readFileSync(file,'utf8'),config=JSON.parse(bytes);assert.equal(config.schema,'AEGIS_OPEN_POW_V3');assert.equal(config.monetary.max_supply,MAX_AEGIS.toString());assert.equal(config.monetary.base_reward,105000000);assert.equal(assertOpenGenesis(config),config);
 assert.notEqual(run(args).status,0);assert.equal(readFileSync(file,'utf8'),bytes);
});
test('nodes enforce rising work, exact issuance, V3 headers and restart without accepting an easier replay',async t=>{
 const root=mkdtempSync(join(tmpdir(),'queer-pow-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const config=configuration();
 let chain=await OpenChain.open({directory:root,config,backend});t.after(()=>chain.close());
 for(let height=1;height<=5;height++){
  const block=await chain.mine({ownerTag:'03'.repeat(32)});
  assert.equal(block.header.version,'AEGIS_POW_HEADER_V3');assert.equal(block.header.target,supplyTarget(config,height));
  assert.equal(block.reward?.value??0,height<=3?config.monetary.base_reward:0);
 }
 assert.equal(chain.status().protocol_minted_supply,MAX_AEGIS.toString());
 const tip=chain.tip;chain.close();chain=await OpenChain.open({directory:root,config,backend});assert.deepEqual(chain.tip,tip);
 const forged=structuredClone(chain.blockAt(3));forged.header.target=initial;forged.header=await mineHeader(forged.header);
 await assert.rejects(chain.addBlock(forged),/HEADER_OR_WORK/);
 const overpaid=structuredClone(chain.blockAt(2));overpaid.reward.value++;overpaid.header.body_hash=digest('AEGIS_POW_BODY_V1',{transaction:null,proof:null,reward:overpaid.reward});overpaid.header=await mineHeader(overpaid.header);
 await assert.rejects(chain.addBlock(overpaid),/SUBSIDY/);
 assert.equal(chain.hashAt(5),blockHash(chain.blockAt(5).header));
});
