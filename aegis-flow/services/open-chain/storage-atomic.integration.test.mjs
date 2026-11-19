import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {OpenChain} from './chain.mjs';import {blockHash} from './consensus.mjs';import {defaultStarkBackend} from '../proof-engine/backend.mjs';
import {canonicalSerialize} from '../../libs/crypto-core/canonical-transcript.mjs';
test('a genuine native transfer prunes multiple fork levels atomically under byte pressure',{skip:!process.env.AEGIS_POW_RECOVERY_ARTIFACT},async t=>{
 const artifact=JSON.parse(readFileSync(process.env.AEGIS_POW_RECOVERY_ARTIFACT)),backend=defaultStarkBackend(),root=mkdtempSync(join(tmpdir(),'prune-native-'));
 const incoming=artifact.blocks.find(b=>b.transaction),prefix=artifact.blocks.filter(b=>b.header.height<incoming.header.height);
 const maxBytes=[...prefix,incoming].reduce((sum,b)=>sum+Buffer.byteLength(canonicalSerialize(b)),0),limits={maxBytes};
 const directory=join(root,'node');let chain=await OpenChain.open({directory,config:artifact.config,backend,limits});const db=new DatabaseSync(join(directory,'chain.sqlite'));
 t.after(()=>{db.close();chain.close();rmSync(root,{recursive:true,force:true});});
 for(const block of prefix)await chain.addBlock(block);
 const orphans=[];
 for(let branch=0;branch<8;branch++){
  const fork=await OpenChain.open({directory:join(root,'fork-'+branch),config:artifact.config,backend});
  try{for(let height=1;height<=3;height++){const block=await fork.mine({ownerTag:'03'.repeat(32)});orphans.push(blockHash(block.header));await chain.addBlock(block);}}finally{fork.close();}
 }
 const before=chain.status();assert.equal(before.resources.stored_blocks,prefix.length+24);
 db.exec("CREATE TRIGGER fail_native_insert BEFORE INSERT ON pow_blocks BEGIN SELECT RAISE(ABORT, 'TEST_NATIVE_COMMIT_FAILURE'); END;");
 await assert.rejects(chain.addBlock(incoming),/TEST_NATIVE_COMMIT_FAILURE/);assert.deepEqual(chain.status(),before);
 for(const hash of orphans)assert.equal(chain.has(hash),true);
 db.exec('DROP TRIGGER fail_native_insert');
 await chain.addBlock(incoming);for(const hash of orphans)assert.equal(chain.has(hash),false);
 assert.equal(chain.status().resources.stored_blocks,prefix.length+1);assert.ok(chain.status().resources.stored_body_bytes<=maxBytes);
 assert.equal(chain.transactionReceipt(incoming.transaction.request_id).transaction_id,incoming.transaction.tx_id);
 const tip=chain.tip;chain.close();chain=await OpenChain.open({directory,config:artifact.config,backend,limits});assert.deepEqual(chain.tip,tip);
});
