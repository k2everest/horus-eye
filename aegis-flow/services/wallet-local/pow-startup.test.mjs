import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {startLocalWallet} from './server.mjs';import {acquireProfileLock} from '../operational-security/profile-lock.mjs';
for(const queer of [false,true])test(`paired server starts PoW ${queer?'V3':'V2'} without legacy authority/genesis-note/anchor files`,async()=>{
 const root=mkdtempSync(join(tmpdir(),'pow-startup-'));const program=JSON.parse(readFileSync(new URL('../proof-engine/program.json',import.meta.url))).program_id;
 const config={schema:'AEGIS_OPEN_POW_V2',network_id:'wallet-startup',program_id:program,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'AEGIS',base_reward:7,max_supply:'700'}};
 if(queer){config.schema='AEGIS_OPEN_POW_V3';config.monetary={asset_id:'QUEER',base_reward:7,max_supply:'2100000000000000',fee_policy:'miner-fees-v1',minimum_fee:1};config.difficulty={policy:'supply-quadratic-v1',minimum_target:'000f'+'ff'.repeat(30)};}
 const path=join(root,'genesis.json');writeFileSync(path,JSON.stringify(config));let server;
 try{server=await startLocalWallet({AEGIS_WALLET_CONFIG:path,AEGIS_WALLET_DIR:join(root,'profile'),AEGIS_POW_PEERS:'["http://127.0.0.1:8090"]'});
  const token=readFileSync(join(root,'profile','pairing-token'),'utf8');const response=await fetch('http://127.0.0.1:8765/status',{headers:{authorization:'Bearer '+token}});assert.equal(response.status,200);const status=await response.json();assert.equal(status.consensus_model,'open-proof-of-work');assert.equal(status.locked,true);assert.equal(status.finality,'probabilistic');
 }finally{
  if(server)await new Promise(r=>server.close(r));
  let release;for(let i=0;i<30&&!release;i++){try{release=await acquireProfileLock(join(root,'profile','process.lock'));}catch(e){if(!/ALREADY_IN_USE/.test(e.message))throw e;await new Promise(r=>setTimeout(r,10));}}
  if(release)await release();rmSync(root,{recursive:true,force:true});
 }
});
