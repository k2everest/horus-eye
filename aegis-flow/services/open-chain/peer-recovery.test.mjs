import test from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {OpenNode} from './node.mjs';import {recoverFromPeers} from './peer-recovery.mjs';
const backend={programId:'42'.repeat(32),verify:async()=>{throw Error('NO_FINANCIAL_TRANSACTION_EXPECTED');}};
async function fixture(t){
 const root=mkdtempSync(join(tmpdir(),'peer-recovery-')),config={schema:'AEGIS_OPEN_POW_V2',network_id:'recover-peers',program_id:backend.programId,genesis_time_ms:Date.now()-60000,pow_limit:'00'+'ff'.repeat(31),target_spacing_ms:60000,retarget_interval:64,confirmations:2,coinbase_maturity:2,anchor_window:64,monetary:{asset_id:'TEST',base_reward:7,max_supply:'700'}};
 const node=new OpenNode({chain:await OpenChain.open({directory:join(root,'source'),config,backend})});await node.listen();
 t.after(async()=>{await node.close();rmSync(root,{recursive:true,force:true});});
 for(let i=0;i<3;i++)await node.mine('03'.repeat(32));
 return{root,node,args:{config,backend,peers:[node.origin],minimumWork:node.chain.tip.work,destinationDirectory:join(root,'recovered')}};
}
test('empty host recovers verified blocks from peers without a bucket, key or remote state snapshot',async t=>{
 const f=await fixture(t),result=await recoverFromPeers(f.args);
 assert.equal(result.report.outcome,'VERIFIED');assert.equal(result.report.imported_blocks,3);assert.equal(result.report.external_storage_required,false);assert.equal(result.report.wallet_keys_recovered,false);
 assert.equal(result.report.tip.hash,f.node.chain.tip.hash);assert.equal(result.report.evidence_accepted,false);
 const recovered=await OpenChain.open({directory:f.args.destinationDirectory,config:f.args.config,backend});
 try{assert.deepEqual(recovered.tip,f.node.chain.tip);}finally{recovered.close();}
 const sentinel=join(f.args.destinationDirectory,'keep');writeFileSync(sentinel,'owned');
 await assert.rejects(recoverFromPeers(f.args),/DESTINATION_EXISTS/);assert.equal(readFileSync(sentinel,'utf8'),'owned');
});
test('budget and independent work floor failures never publish a partial recovered profile',async t=>{
 const f=await fixture(t);
 const result=await recoverFromPeers({...f.args,maxBlocks:2});
 assert.equal(result.report.outcome,'FAILED');assert.equal(result.report.imported_blocks,2);assert.equal(existsSync(f.args.destinationDirectory),false);
 await assert.rejects(recoverFromPeers({...f.args,minimumWork:'0'}),/WORK_FLOOR_REQUIRED/);
});
test('partially imported malicious batches count against the recovery budget before peer failover',async t=>{
 const f=await fixture(t);
 const bad=http.createServer(async(req,res)=>{const value=await(await fetch(f.node.origin+req.url)).json();if(req.url==='/chain/blocks/2')value.reward.value++;res.setHeader('content-type','application/json');res.end(JSON.stringify(value));});
 await new Promise(resolve=>bad.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>bad.close(resolve)));
 const result=await recoverFromPeers({...f.args,peers:[`http://127.0.0.1:${bad.address().port}`,f.node.origin],maxBlocks:2});
 assert.equal(result.report.outcome,'FAILED');assert.equal(result.report.imported_blocks,2);assert.equal(result.report.peer_attempts[0].imported_blocks,1);assert.equal(result.report.peer_attempts[0].failures,1);assert.equal(existsSync(f.args.destinationDirectory),false);
});
test('a slow peer cannot exceed the total recovery deadline or publish a profile',async t=>{
 const f=await fixture(t),slow=http.createServer((_req,res)=>{setTimeout(()=>res.end('{}'),500);});
 await new Promise(resolve=>slow.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>slow.close(resolve)));
 const result=await recoverFromPeers({...f.args,peers:[`http://127.0.0.1:${slow.address().port}`],timeoutMs:50});
 assert.equal(result.report.outcome,'FAILED');assert.equal(result.report.failure_code,'PEER_RECOVERY_TIMEOUT');assert.equal(existsSync(f.args.destinationDirectory),false);
});
