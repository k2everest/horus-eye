import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {defaultStarkBackend} from '../proof-engine/backend.mjs';
test('canonical receipt index follows native-proof inclusion, confirmation, reorg and restart without hashing history',{skip:!process.env.AEGIS_POW_RECOVERY_ARTIFACT},async t=>{
 const artifact=JSON.parse(readFileSync(process.env.AEGIS_POW_RECOVERY_ARTIFACT)),backend=defaultStarkBackend(),root=mkdtempSync(join(tmpdir(),'receipt-native-'));
 const directory=join(root,'node');let chain=await OpenChain.open({directory,config:artifact.config,backend});const fork=await OpenChain.open({directory:join(root,'fork'),config:artifact.config,backend});
 t.after(()=>{fork.close();chain.close();rmSync(root,{recursive:true,force:true});});
 const transactionBlock=artifact.blocks.find(b=>b.transaction);assert.ok(transactionBlock);
 const request=transactionBlock.transaction.request_id;
 for(const block of artifact.blocks){await chain.addBlock(block);if(block===transactionBlock)assert.equal(chain.transactionReceipt(request).status,'INCLUDED_POW');}
 const receipt=chain.transactionReceipt(request);assert.equal(receipt.status,'CONFIRMED_POW');assert.equal(chain.status().resources.canonical_transactions,1);
 const original=crypto.createHash;let hashes=0;
 try{crypto.createHash=(...args)=>{hashes++;return original(...args);};for(let i=0;i<100;i++)assert.deepEqual(chain.transactionReceipt(request),receipt);}finally{crypto.createHash=original;}
 assert.equal(hashes,0);
 const changed=chain.transactionReceipt(request);changed.height=999;assert.equal(chain.transactionReceipt(request).height,receipt.height);
 chain.close();chain=await OpenChain.open({directory,config:artifact.config,backend});assert.deepEqual(chain.transactionReceipt(request),receipt);
 for(const block of artifact.blocks.filter(b=>b.header.height<transactionBlock.header.height))await fork.addBlock(block);
 while(fork.tip.height<=chain.tip.height)await fork.mine({ownerTag:'03'.repeat(32)});
 for(const block of fork.blocks())await chain.addBlock(block);
 assert.equal(chain.transactionReceipt(request),undefined);assert.equal(chain.status().resources.canonical_transactions,0);
 chain.close();chain=await OpenChain.open({directory,config:artifact.config,backend});assert.equal(chain.transactionReceipt(request),undefined);assert.equal(chain.status().resources.canonical_transactions,0);
});
