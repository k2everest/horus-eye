import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOpenGenesis,openNetworkId,subsidy,transactionFee,minerReward,assertBlockHeader,mineHeader,digest,genesisTip} from './consensus.mjs';
import {createPrivateNote} from '../../libs/crypto-core/shielded-note-v2.mjs';
const legacy={schema:'AEGIS_OPEN_POW_V2',network_id:'fee-test',program_id:'42'.repeat(32),genesis_time_ms:0,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'TEST',base_reward:7,max_supply:'10'}};
const config={...legacy,monetary:{...legacy.monetary,fee_policy:'miner-fees-v1',minimum_fee:1}};
test('fee policy is explicitly genesis-bound; legacy networks retain zero fees',()=>{
 assert.equal(assertOpenGenesis(config),config);assert.notEqual(openNetworkId(config),openNetworkId(legacy));
 assert.equal(transactionFee(legacy,{public_amount:0}),0);assert.throws(()=>transactionFee(legacy,{public_amount:1}));
 for(const m of [{...config.monetary,minimum_fee:0},{...config.monetary,minimum_fee:1.5},{...config.monetary,fee_policy:'other'},{...legacy.monetary,minimum_fee:1}])assert.throws(()=>assertOpenGenesis({...config,monetary:m}));
});
test('miner receives only capped subsidy plus conserved fee, including fee-only blocks after exhaustion',()=>{
 assert.equal(subsidy(config,1),7);assert.equal(subsidy(config,2),3);assert.equal(subsidy(config,3),0);
 assert.equal(minerReward(config,1,{public_amount:2}),9);assert.equal(minerReward(config,2,{public_amount:2}),5);
 assert.equal(minerReward(config,3,{public_amount:2}),2);assert.equal(minerReward(config,4,null),0);
 // Consumed 7 = recipient 3 + fee 4; recycling that fee adds no issuance.
 assert.equal(3+minerReward(config,3,{public_amount:4}),7);
 assert.equal([1,2,3,4].reduce((sum,h)=>sum+subsidy(config,h),0),10);
});
test('invalid fees and reward overflow fail closed before proof processing',()=>{
 for(const fee of [-1,0,1.5,'1',null,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>transactionFee(config,{public_amount:fee}));
 assert.throws(()=>minerReward(config,1,{public_amount:Number.MAX_SAFE_INTEGER}),/OVERFLOW/);
 assert.equal(minerReward(config,3,{public_amount:Number.MAX_SAFE_INTEGER}),Number.MAX_SAFE_INTEGER);
});
test('header validation rejects both overpayment and underpayment of subsidy plus fee',async()=>{
 // No positive financial acceptance is simulated here: malformed transactions
 // must still be rejected later by signature/native proof verification.
 for(const value of [8,10]){
  const body={transaction:{public_amount:2},proof:{},reward:createPrivateNote({ownerTag:'03'.repeat(32),value,assetId:'TEST'})};
  const header=await mineHeader({version:'AEGIS_POW_HEADER_V2',network:openNetworkId(config),height:1,parent:openNetworkId(config),timestamp_ms:1,target:config.pow_limit,nonce:'0'.repeat(64),body_hash:digest('AEGIS_POW_BODY_V1',body),note_root:genesisTip(config).note_root,nullifier_root:genesisTip(config).nullifier_root,commitment_count:1});
  assert.throws(()=>assertBlockHeader(config,{header,...body},[]),/INVALID_PROTOCOL_SUBSIDY/);
 }
});
